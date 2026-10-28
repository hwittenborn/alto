import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Backend,
  type ServerEnv,
  serverRead,
  serverTree,
  serverWrite,
  startServers,
  TestClient,
} from './harness.ts';

let env: ServerEnv;

beforeAll(async () => {
  env = await startServers();
});

afterAll(async () => {
  await env?.stop();
});

// "nextcloud" is covered separately below: rclone's WebDAV server can't answer
// Nextcloud's checksum queries, which rclone performs after every upload.
const BACKENDS: Backend[] = ['webdav'];
let counter = 0;

/** Two machines syncing the same remote folder. */
async function pair(backend: Backend, options: { trash?: boolean } = {}) {
  const remotePath = `shared/${backend}-${++counter}`;
  const a = await TestClient.create(env, `a${counter}`, options);
  const b = await TestClient.create(env, `b${counter}`, options);
  await a.connect(env, backend, remotePath);
  await b.connect(env, backend, remotePath);
  const close = async () => {
    await a.close();
    await b.close();
  };
  return { a, b, remotePath, close };
}

describe.each(BACKENDS)(
  'two clients over %s',
  (backend) => {
    it('propagates new files, edits and folders in both directions', async () => {
      const { a, b, remotePath, close } = await pair(backend);
      try {
        a.write('notes.txt', 'hello from a');
        a.write('docs/report.md', '# report');
        a.mkdir('empty-folder');
        await a.sync();
        expect(serverRead(env, `${remotePath}/notes.txt`)).toBe('hello from a');
        expect(serverTree(env, remotePath)).toContain('empty-folder');

        await b.sync();
        expect(b.read('notes.txt')).toBe('hello from a');
        expect(b.read('docs/report.md')).toBe('# report');
        expect(b.exists('empty-folder')).toBe(true);

        b.write('notes.txt', 'edited on b, longer');
        b.write('from-b/new.txt', 'new');
        await b.sync();
        await a.sync();
        expect(a.read('notes.txt')).toBe('edited on b, longer');
        expect(a.read('from-b/new.txt')).toBe('new');
        expect(a.issues).toEqual([]);
        expect(b.issues).toEqual([]);

        // A no-op cycle stays a no-op.
        await a.sync();
        await b.sync();
        expect(a.tree()).toEqual(b.tree());
      } finally {
        await close();
      }
    });

    it('propagates deletions of files and folders', async () => {
      const { a, b, remotePath, close } = await pair(backend);
      try {
        a.write('keep.txt', 'keep');
        a.write('gone.txt', 'gone');
        a.write('dir/sub/deep.txt', 'deep');
        await a.sync();
        await b.sync();
        expect(b.exists('dir/sub/deep.txt')).toBe(true);

        b.remove('gone.txt');
        b.remove('dir');
        await b.sync();
        expect(serverTree(env, remotePath)).toEqual(['keep.txt']);

        await a.sync();
        expect(a.tree()).toEqual(['keep.txt']);
      } finally {
        await close();
      }
    });

    it('moves a folder deleted on the other machine to the trash in one piece', async () => {
      const { a, b, remotePath, close } = await pair(backend, { trash: true });
      try {
        a.write('keep.txt', 'keep');
        a.write('Taxes/2023.pdf', 'old');
        a.write('Taxes/2024/return.pdf', 'new');
        await a.sync();
        await b.sync();

        b.remove('Taxes');
        await b.sync();
        expect(serverTree(env, remotePath)).toEqual(['keep.txt']);

        await a.sync();
        expect(a.tree()).toEqual(['keep.txt']);
        expect(a.trashed).toEqual(['Taxes']);
      } finally {
        await close();
      }
    });

    it('detects edits on both ends and resolves them', async () => {
      const { a, b, remotePath, close } = await pair(backend);
      try {
        a.write('shared.txt', 'v1');
        await a.sync();
        await b.sync();

        // Both machines edit while "offline".
        a.write('shared.txt', "a's version");
        b.write('shared.txt', "b's much longer version");
        await a.sync();
        expect(serverRead(env, `${remotePath}/shared.txt`)).toBe("a's version");

        await b.sync();
        // b must not have been overwritten, and must not have overwritten a.
        expect(b.read('shared.txt')).toBe("b's much longer version");
        expect(serverRead(env, `${remotePath}/shared.txt`)).toBe("a's version");
        const conflict = b.issues.find((i) => i.kind === 'conflict');
        expect(conflict).toMatchObject({ kind: 'conflict', path: 'shared.txt', reason: 'both-modified' });

        // Still a conflict on the next cycle (not silently resolved).
        await b.sync();
        expect(b.issues.filter((i) => i.kind === 'conflict')).toHaveLength(1);

        const res = await b.alto.resolveConflict(b.folderId, 'shared.txt', 'local');
        expect(res.ok).toBe(true);
        expect(serverRead(env, `${remotePath}/shared.txt`)).toBe("b's much longer version");
        expect(b.issues).toEqual([]);

        await a.sync();
        expect(a.read('shared.txt')).toBe("b's much longer version");
        expect(a.issues).toEqual([]);
      } finally {
        await close();
      }
    });

    it('keeps both versions when asked', async () => {
      const { a, b, remotePath, close } = await pair(backend);
      try {
        a.write('plan.txt', 'v1');
        await a.sync();
        await b.sync();
        a.write('plan.txt', 'plan by a');
        b.write('plan.txt', 'plan by b!!');
        await a.sync();
        await b.sync();
        expect(b.issues.map((i) => i.kind)).toEqual(['conflict']);

        const res = await b.alto.resolveConflict(b.folderId, 'plan.txt', 'both');
        expect(res.ok && res.value.conflictCopy).toMatch(/^plan \(conflicted copy from b\d+ .*\)\.txt$/);
        const copy = res.ok ? res.value.conflictCopy! : '';
        expect(b.read('plan.txt')).toBe('plan by a');
        expect(b.read(copy)).toBe('plan by b!!');
        expect(serverRead(env, `${remotePath}/${copy}`)).toBe('plan by b!!');

        await a.sync();
        expect(a.read(copy)).toBe('plan by b!!');
        expect(a.read('plan.txt')).toBe('plan by a');
      } finally {
        await close();
      }
    });

    it('lets an edit win over a deletion on the other machine', async () => {
      const { a, b, close } = await pair(backend);
      try {
        a.write('draft.txt', 'first');
        await a.sync();
        await b.sync();

        a.remove('draft.txt');
        b.write('draft.txt', 'edited after all');
        await a.sync(); // deletes on the server
        await b.sync(); // edit beats the deletion: re-uploaded
        await a.sync(); // and restored on a
        expect(a.read('draft.txt')).toBe('edited after all');
        expect(b.read('draft.txt')).toBe('edited after all');
        expect([...a.issues, ...b.issues]).toEqual([]);
      } finally {
        await close();
      }
    });

    it('treats identical files created on both sides as already in sync', async () => {
      const { a, b, close } = await pair(backend);
      try {
        a.write('same.txt', 'identical content');
        b.write('same.txt', 'identical content');
        a.write('different.txt', 'from a');
        b.write('different.txt', 'from b');
        await a.sync();
        await b.sync();
        expect(b.issues.map((i) => (i.kind === 'conflict' ? `${i.path}:${i.reason}` : i.kind))).toEqual([
          'different.txt:both-created',
        ]);
        expect(b.read('different.txt')).toBe('from b');
      } finally {
        await close();
      }
    });

    it('applies shared exclusion lists from .altoignore', async () => {
      const { a, b, remotePath, close } = await pair(backend);
      try {
        a.write('.altoignore', '*.tmp\nbuild/\n!important.tmp\n');
        a.write('src/main.c', 'int main;');
        a.write('src/cache.tmp', 'junk');
        a.write('important.tmp', 'keep me');
        a.write('build/out.o', 'binary');
        await a.sync();
        expect(serverTree(env, remotePath).sort()).toEqual(
          ['.altoignore', 'important.tmp', 'src', 'src/main.c'].sort(),
        );

        // The rules reach b before b's own files are considered.
        b.write('local-only.tmp', "b's scratch");
        b.write('build/b.o', "b's build");
        await b.sync();
        expect(b.read('.altoignore')).toContain('build/');
        expect(serverRead(env, `${remotePath}/local-only.tmp`)).toBeNull();
        expect(b.read('local-only.tmp')).toBe("b's scratch");
        expect(b.read('src/main.c')).toBe('int main;');

        // Updating the rules on b propagates to a.
        await b.alto.setExclusions(b.folderId, ['*.tmp', 'build/', '!important.tmp', '*.c']);
        await b.sync();
        await a.sync();
        expect(await a.alto.getExclusions(a.folderId)).toEqual(['*.tmp', 'build/', '!important.tmp', '*.c']);
        // Excluded files are never deleted anywhere.
        expect(a.read('src/main.c')).toBe('int main;');
        expect(a.read('build/out.o')).toBe('binary');
      } finally {
        await close();
      }
    });

    it('keeps folders that still contain excluded files', async () => {
      const { a, b, remotePath, close } = await pair(backend);
      try {
        a.write('.altoignore', '*.log\n');
        a.write('project/code.js', 'x');
        await a.sync();
        await b.sync();
        b.write('project/debug.log', 'local log');

        a.remove('project');
        await a.sync();
        await b.sync();
        expect(b.read('project/debug.log')).toBe('local log');
        expect(b.exists('project/code.js')).toBe(false);
        expect(b.issues).toEqual([]);
        expect(serverTree(env, remotePath)).toContain('.altoignore');
      } finally {
        await close();
      }
    });

    it('reports file/folder type conflicts without touching either side', async () => {
      const { a, b, close } = await pair(backend);
      try {
        a.write('thing', 'a file');
        b.write('thing/inside.txt', 'a folder');
        await a.sync();
        await b.sync();
        expect(b.issues).toMatchObject([{ kind: 'conflict', path: 'thing', reason: 'type-mismatch' }]);
        expect(b.read('thing/inside.txt')).toBe('a folder');
        expect(a.read('thing')).toBe('a file');

        const res = await b.alto.resolveConflict(b.folderId, 'thing', 'local');
        expect(res.ok).toBe(true);
        await b.sync();
        await a.sync();
        expect(a.read('thing/inside.txt')).toBe('a folder');
      } finally {
        await close();
      }
    });
  },
  300_000,
);

describe('safety', () => {
  it('never overwrites a remote change that lands mid-cycle', async () => {
    const { a, b, remotePath, close } = await pair('webdav');
    try {
      a.write('race.txt', 'v1');
      await a.sync();
      await b.sync();
      a.write('race.txt', "a's edit");
      b.write('race.txt', "b's concurrent edit");
      // b uploads right after a listed the server, before a uploads.
      const folder = a.folder as unknown as { listSide: (side: string) => Promise<unknown> };
      const original = folder.listSide.bind(folder);
      folder.listSide = async (side: string) => {
        const result = await original(side);
        if (side === 'remote') await b.sync();
        return result;
      };
      await a.folder.sync();
      folder.listSide = original;
      expect(serverRead(env, `${remotePath}/race.txt`)).toBe("b's concurrent edit");
      expect(a.folder.needsResync).toBe(true);
      await a.sync();
      expect(a.issues).toMatchObject([{ kind: 'conflict', path: 'race.txt', reason: 'both-modified' }]);
      expect(a.read('race.txt')).toBe("a's edit");
    } finally {
      await close();
    }
  });

  it('keeps a deleted folder when a file inside it changes mid-cycle', async () => {
    const { a, b, remotePath, close } = await pair('webdav', { trash: true });
    try {
      a.write('Notes/plan.txt', 'v1');
      a.write('Notes/ideas.txt', 'ideas');
      await a.sync();
      await b.sync();
      b.remove('Notes');
      await b.sync();
      // a edits a file in the folder right after listing, before deleting it.
      const folder = a.folder as unknown as { listSide: (side: string) => Promise<unknown> };
      const original = folder.listSide.bind(folder);
      folder.listSide = async (side: string) => {
        const result = await original(side);
        if (side === 'local') a.write('Notes/plan.txt', "a's late edit");
        return result;
      };
      await a.folder.sync();
      folder.listSide = original;
      expect(a.trashed).toEqual([]);
      expect(a.read('Notes/plan.txt')).toBe("a's late edit");
      await a.sync();
      // The edit beats the deletion; the untouched file follows the deletion.
      expect(serverRead(env, `${remotePath}/Notes/plan.txt`)).toBe("a's late edit");
      expect(a.tree()).toEqual(['Notes', 'Notes/plan.txt']);
      expect(a.trashed).toEqual(['Notes/ideas.txt']);
    } finally {
      await close();
    }
  });

  it('counts the files inside deleted folders before a mass deletion', async () => {
    const { a, b, remotePath, close } = await pair('webdav', { trash: true });
    try {
      for (let i = 0; i < 20; i++) a.write(`Photos/2024/p${i}.jpg`, `photo ${i}`);
      a.write('notes.txt', 'notes');
      await a.sync();
      await b.sync();
      b.remove('Photos');
      await b.sync();
      expect(b.issues).toMatchObject([{ kind: 'mass-deletion', side: 'remote', count: 20 }]);
      expect(serverTree(env, remotePath)).toHaveLength(23);

      await b.alto.resolveMassDeletion(b.folderId, 'remote', 'restore');
      await b.sync();
      expect(b.tree()).toHaveLength(23);
      expect(b.issues).toEqual([]);
    } finally {
      await close();
    }
  });

  it('holds mass deletions until confirmed, and can restore', async () => {
    const { a, b, remotePath, close } = await pair('webdav');
    try {
      for (let i = 0; i < 30; i++) a.write(`f${i}.txt`, `file ${i}`);
      await a.sync();
      await b.sync();
      for (let i = 0; i < 25; i++) b.remove(`f${i}.txt`);
      await b.sync();
      expect(b.issues).toMatchObject([{ kind: 'mass-deletion', side: 'remote', count: 25 }]);
      expect(serverTree(env, remotePath)).toHaveLength(30);

      await b.alto.resolveMassDeletion(b.folderId, 'remote', 'restore');
      await b.sync();
      expect(b.tree()).toHaveLength(30);
      expect(b.issues).toEqual([]);

      for (let i = 0; i < 25; i++) b.remove(`f${i}.txt`);
      await b.sync();
      await b.alto.resolveMassDeletion(b.folderId, 'remote', 'delete');
      await b.sync();
      expect(serverTree(env, remotePath)).toHaveLength(5);
      // The other machine is asked too before it deletes 25 local files.
      await a.sync();
      expect(a.issues).toMatchObject([{ kind: 'mass-deletion', side: 'local', count: 25 }]);
      expect(a.tree()).toHaveLength(30);
      await a.alto.resolveMassDeletion(a.folderId, 'local', 'delete');
      await a.sync();
      expect(a.tree()).toHaveLength(5);
    } finally {
      await close();
    }
  });

  it('refuses to sync when the local folder disappears', async () => {
    const { a, remotePath, close } = await pair('webdav');
    try {
      a.write('precious.txt', 'data');
      await a.sync();
      a.remove('');
      await a.folder.sync();
      expect(a.folder.runtime.phase).toBe('error');
      expect(serverRead(env, `${remotePath}/precious.txt`)).toBe('data');
    } finally {
      await close();
    }
  });

  it('reports an offline server without losing state', async () => {
    const c = await TestClient.create(env, 'offline');
    try {
      const created = await c.alto.createRemote({
        provider: 'webdav',
        name: 'dead',
        values: { url: 'http://127.0.0.1:1/', username: 'x', password: 'y' },
      });
      expect(created.ok).toBe(false);
      if (!created.ok) {
        expect(created.error.code).toBe('connect');
        expect(created.error.body).toMatch(/Unable to connect/);
        expect(created.error.detail).toMatch(/connect/i);
      }
      expect(c.alto.store.getState().remotes).toEqual([]);
    } finally {
      await c.close();
    }
  });

  it('rejects overlapping folders', async () => {
    const { a, close } = await pair('webdav');
    try {
      a.mkdir('nested');
      const res = await a.alto.addFolder({
        remote: 'server',
        localPath: a.path('nested'),
        remotePath: 'elsewhere',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('local-overlap');
    } finally {
      await close();
    }
  });

  it('logs in to Nextcloud through its WebDAV endpoint and downloads files', async () => {
    serverWrite(env, 'nc-files/hello.txt', 'hello nextcloud');
    const c = await TestClient.create(env, 'nc');
    try {
      await c.connect(env, 'nextcloud', 'nc-files');
      const cfg = await c.daemon.client.getRemote('server');
      expect(cfg).toMatchObject({ type: 'webdav', vendor: 'nextcloud', user: 'alice' });
      expect(cfg.url).toMatch(/\/remote\.php\/dav\/files\/alice$/);
      await c.sync();
      expect(c.read('hello.txt')).toBe('hello nextcloud');
      expect(await c.alto.listRemoteFolders('server', '')).toContain('nc-files');
    } finally {
      await c.close();
    }
  });

  it('explains a server URL with nothing behind it', async () => {
    const c = await TestClient.create(env, 'nc-wrong-url');
    try {
      const nextcloud = env.backends.nextcloud;
      const created = await c.alto.createRemote({
        provider: 'nextcloud',
        name: 'wrong',
        values: { ...nextcloud.values, url: `${nextcloud.values.url}/elsewhere` },
      });
      expect(created.ok).toBe(false);
      if (!created.ok) expect(created.error.code).toBe('not-found');
      expect(c.alto.store.getState().remotes).toEqual([]);
    } finally {
      await c.close();
    }
  });

  it('propagates a file replaced by a folder (and back)', async () => {
    const { a, b, close } = await pair('webdav');
    try {
      a.write('item', 'a plain file');
      await a.sync();
      await b.sync();
      a.remove('item');
      a.write('item/child.txt', 'now a folder');
      await a.sync();
      await b.sync();
      expect(b.read('item/child.txt')).toBe('now a folder');
      expect(b.issues).toEqual([]);

      b.remove('item');
      b.write('item', 'a file again');
      await b.sync();
      await a.sync();
      expect(a.read('item')).toBe('a file again');
      expect([...a.issues, ...b.issues]).toEqual([]);
    } finally {
      await close();
    }
  });
});

describe('remote folders', () => {
  it('are created on the server, with the folders above them, for adding a folder', async () => {
    const client = await TestClient.create(env, `mkdir${++counter}`);
    try {
      const b = env.backends.webdav;
      const created = await client.alto.createRemote({ provider: b.provider, name: 'server', values: b.values });
      if (!created.ok) throw new Error(created.error.message);
      const result = await client.alto.createRemoteFolder('server', `/new-${counter}/Photos/`);
      expect(result).toEqual({ ok: true, value: { path: `new-${counter}/Photos` } });
      expect(await client.alto.listRemoteFolders('server', `new-${counter}`)).toEqual(['Photos']);
      expect((await client.alto.createRemoteFolder('server', '/')).ok).toBe(false);
    } finally {
      await client.close();
    }
  });
});
