import { mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodeLocalFs, RcloneDaemon } from '../../node/src/index.ts';
import { Alto, MemoryStorage } from '../src/index.ts';
import { RCLONE, type ServerEnv, serverRead, serverTree, sleep, startServers, TestClient } from './harness.ts';

let env: ServerEnv;
let counter = 0;

beforeAll(async () => {
  env = await startServers();
});

afterAll(async () => {
  await env?.stop();
});

async function waitFor(what: string, check: () => boolean, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(50);
  }
}

describe('narrow cycles', () => {
  it('sync just the changed paths', async () => {
    const client = await TestClient.create(env, `narrow${++counter}`, { trash: true });
    const remotePath = `narrow-${counter}`;
    try {
      await client.connect(env, 'webdav', remotePath);
      client.write('a.txt', 'a');
      client.write('b.txt', 'b');
      client.write('Folder/c.txt', 'c');
      await client.sync();

      client.remove('a.txt');
      client.remove('Folder');
      client.write('b.txt', 'b, edited');
      await client.folder.syncPaths(['a.txt', 'Folder', 'Folder/c.txt']);
      expect(serverTree(env, remotePath)).toEqual(['b.txt']);
      // Not among the paths: left for a full cycle.
      expect(serverRead(env, `${remotePath}/b.txt`)).toBe('b');
      expect(client.issues).toEqual([]);

      await client.sync();
      expect(serverRead(env, `${remotePath}/b.txt`)).toBe('b, edited');
    } finally {
      await client.close();
    }
  });

  it('leave a mass deletion to a full cycle, which holds it', async () => {
    const client = await TestClient.create(env, `narrow${++counter}`);
    const remotePath = `narrow-${counter}`;
    try {
      await client.connect(env, 'webdav', remotePath);
      for (let i = 0; i < 12; i++) client.write(`f${i}.txt`, `file ${i}`);
      await client.sync();

      const removed = Array.from({ length: 11 }, (_, i) => `f${i}.txt`);
      for (const file of removed) client.remove(file);
      await client.folder.syncPaths(removed);
      expect(client.issues).toMatchObject([{ kind: 'mass-deletion', side: 'remote', count: 11 }]);
      expect(serverTree(env, remotePath)).toHaveLength(12);
    } finally {
      await client.close();
    }
  });
});

describe('files still being written', () => {
  it('are left for a cycle once they have settled', async () => {
    const client = await TestClient.create(env, `settle${++counter}`);
    const remotePath = `settle-${counter}`;
    try {
      await client.connect(env, 'webdav', remotePath);
      client.write('old.txt', 'written a while ago');
      writeFileSync(client.path('new.txt'), 'just written');
      await client.sync();
      expect(serverTree(env, remotePath)).toEqual(['old.txt']);
      expect(client.folder.settling).toEqual(['new.txt']);

      await sleep(2_100);
      await client.sync();
      expect(serverRead(env, `${remotePath}/new.txt`)).toBe('just written');
      expect(client.folder.settling).toEqual([]);
    } finally {
      await client.close();
    }
  });
});

describe('pausing', () => {
  it('uploads a file again after pausing stopped it part way, without a conflict', async () => {
    const client = await TestClient.create(env, `pause${++counter}`);
    const remotePath = `pause-${counter}`;
    const size = 24 * 1024 * 1024;
    try {
      await client.connect(env, 'webdav', remotePath);
      await client.sync();
      writeFileSync(client.path('big.bin'), Buffer.alloc(size, 7));
      // Written a while ago: not held back as still being written.
      utimesSync(client.path('big.bin'), Date.now() / 1000 - 60, Date.now() / 1000 - 60);
      // Slow enough to pause in the middle.
      await client.daemon.client.call('core/bwlimit', { rate: '4M' });
      const cycle = client.folder.sync();
      const served = join(env.root, remotePath, 'big.bin');
      await waitFor('part of the upload', () => {
        try {
          return statSync(served).size > 0;
        } catch {
          return false;
        }
      });
      await client.alto.setFolderPaused(client.folderId, true);
      await cycle;
      // rclone's WebDAV server keeps what it received.
      expect(statSync(served).size).toBeLessThan(size);

      await client.daemon.client.call('core/bwlimit', { rate: 'off' });
      await client.alto.setFolderPaused(client.folderId, false);
      await client.sync();
      expect(client.issues).toEqual([]);
      expect(statSync(served).size).toBe(size);
    } finally {
      await client.close();
    }
  });

  it('uploads it again without a conflict when the server was still writing what it had received', async () => {
    const client = await TestClient.create(env, `pause${++counter}`);
    const remotePath = `pause-${counter}`;
    const size = 24 * 1024 * 1024;
    const rclone = client.daemon.client;
    const stat = rclone.stat.bind(rclone);
    try {
      await client.connect(env, 'webdav', remotePath);
      await client.sync();
      writeFileSync(client.path('big.bin'), Buffer.alloc(size, 7));
      const written = Date.now() / 1000 - 60;
      utimesSync(client.path('big.bin'), written, written);
      await rclone.call('core/bwlimit', { rate: '4M' });
      const cycle = client.folder.sync();
      const served = join(env.root, remotePath, 'big.bin');
      await waitFor('part of the upload', () => {
        try {
          return statSync(served).size > 0;
        } catch {
          return false;
        }
      });
      // A server finishes the stopped upload's request a moment later: it
      // writes out what it had received, then sets the file's time.
      let finishing = true;
      rclone.stat = async (...args) => {
        const item = await stat(...args);
        if (finishing && args[1] === 'big.bin') {
          finishing = false;
          const { url, username, password } = env.backends.webdav.values as Record<string, string>;
          await fetch(new URL(`${remotePath}/big.bin`, url), {
            method: 'PUT',
            headers: {
              authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
              'x-oc-mtime': String(Math.floor(written)),
            },
            body: Buffer.alloc(statSync(served).size + 1024 * 1024, 7),
          });
        }
        return item;
      };
      await client.alto.setFolderPaused(client.folderId, true);
      // Paused right away, while the upload winds down.
      const phases = new Set<string>();
      const watch = setInterval(() => phases.add(client.folder.runtime.phase), 50);
      await cycle;
      clearInterval(watch);
      expect([...phases]).toEqual(['paused']);
      rclone.stat = stat;
      expect(finishing).toBe(false);
      expect(statSync(served).size).toBeLessThan(size);

      await rclone.call('core/bwlimit', { rate: 'off' });
      await client.alto.setFolderPaused(client.folderId, false);
      // Not "Files are synced." before it has looked.
      expect(client.folder.runtime.phase).toBe('checking');
      await client.sync();
      expect(client.issues).toEqual([]);
      expect(statSync(served).size).toBe(size);
    } finally {
      rclone.stat = stat;
      await client.close();
    }
  });
});

describe('resuming', () => {
  it('syncs the folder right away', async () => {
    const base = join(env.tmp, `resume${++counter}`);
    const dir = join(base, 'sync');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'a.txt'), 'a');
    const daemon = await RcloneDaemon.start({
      binary: RCLONE,
      configPath: join(base, 'rclone.conf'),
      cacheDir: join(base, 'cache'),
      logFile: join(base, 'rclone.log'),
    });
    const alto = new Alto({
      rclone: daemon.client,
      storage: new MemoryStorage(),
      platform: { localFs: new NodeLocalFs({ homeDir: base }), hostName: 'resume', openAuthUrl: () => {} },
      // Only resuming can sync in time.
      pollInterval: 600_000,
    });
    const remotePath = `resume-${counter}`;
    try {
      await alto.start();
      const backend = env.backends.webdav;
      await alto.createRemote({ provider: backend.provider, name: 'server', values: backend.values });
      const added = await alto.addFolder({ remote: 'server', localPath: dir, remotePath });
      if (!added.ok) throw new Error(added.error.message);
      const id = added.value.id;
      const phase = () => alto.store.getState().folders[0]?.runtime.phase;
      await waitFor('the first sync', () => serverTree(env, remotePath).length === 1 && phase() === 'idle');

      await alto.setFolderPaused(id, true);
      writeFileSync(join(dir, 'b.txt'), 'b');
      utimesSync(join(dir, 'b.txt'), Date.now() / 1000 - 60, Date.now() / 1000 - 60);
      await sleep(1500);
      expect(serverRead(env, `${remotePath}/b.txt`)).toBeNull();

      await alto.setFolderPaused(id, false);
      // Not "Files are synced." before it has looked.
      expect(phase()).toBe('checking');
      await waitFor('the change on the server', () => serverRead(env, `${remotePath}/b.txt`) === 'b', 5_000);
    } finally {
      await alto.stop();
      await daemon.stop();
    }
  });
});

describe('the file watcher', () => {
  it('syncs a local deletion right away, without listing everything', async () => {
    const base = join(env.tmp, `watch${++counter}`);
    const dir = join(base, 'sync');
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 3; i++) writeFileSync(join(dir, `f${i}.txt`), `file ${i}`);
    const daemon = await RcloneDaemon.start({
      binary: RCLONE,
      configPath: join(base, 'rclone.conf'),
      cacheDir: join(base, 'cache'),
      logFile: join(base, 'rclone.log'),
    });
    const alto = new Alto({
      rclone: daemon.client,
      storage: new MemoryStorage(),
      platform: { localFs: new NodeLocalFs({ homeDir: base }), hostName: 'watch', openAuthUrl: () => {} },
      // Only the watcher can sync in time.
      pollInterval: 600_000,
    });
    const remotePath = `watch-${counter}`;
    try {
      await alto.start();
      const backend = env.backends.webdav;
      await alto.createRemote({ provider: backend.provider, name: 'server', values: backend.values });
      const added = await alto.addFolder({ remote: 'server', localPath: dir, remotePath });
      if (!added.ok) throw new Error(added.error.message);
      await waitFor('the first sync', () => serverTree(env, remotePath).length === 3);
      await waitFor('the folder to settle', () => alto.store.getState().folders[0]?.runtime.phase === 'idle');

      const list = daemon.client.list.bind(daemon.client);
      const fullListings: string[] = [];
      daemon.client.list = (fs, path, ...rest) => {
        if (path === '') fullListings.push(fs);
        return list(fs, path, ...rest);
      };
      const deleted = Date.now();
      rmSync(join(dir, 'f1.txt'));
      await waitFor('the deletion on the server', () => serverRead(env, `${remotePath}/f1.txt`) === null, 5_000);
      expect(Date.now() - deleted).toBeLessThan(3_000);
      expect(fullListings).toEqual([]);
    } finally {
      await alto.stop();
      await daemon.stop();
    }
  });
});
