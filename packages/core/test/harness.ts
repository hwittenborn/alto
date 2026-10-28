/**
 * Integration test harness: real rclone servers (WebDAV and Nextcloud-style
 * WebDAV) and independent Alto "clients", each with its own rclone
 * daemon, config, state and local folder — like separate machines.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  existsSync,
  readdirSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { Alto, MemoryStorage, type ProviderId, type ProviderValues, type SyncFolder } from '../src/index.ts';
import { NodeLocalFs, RcloneDaemon } from '../../node/src/index.ts';

export const RCLONE = process.env.RCLONE ?? 'rclone';

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export type Backend = 'webdav' | 'nextcloud';

export interface ServerEnv {
  root: string;
  tmp: string;
  daemon: RcloneDaemon;
  backends: Record<Backend, { provider: ProviderId; values: ProviderValues; served: string }>;
  stop(): Promise<void>;
}

const USER = 'alice';
const PASS = 's3cret-pass';

/** Start one rclone daemon serving a directory over every protocol. */
export async function startServers(): Promise<ServerEnv> {
  const tmp = mkdtempSync(join(tmpdir(), 'alto-it-'));
  const root = join(tmp, 'server');
  mkdirSync(root, { recursive: true });
  const daemon = await RcloneDaemon.start({
    binary: RCLONE,
    configPath: join(tmp, 'server-rclone.conf'),
    cacheDir: join(tmp, 'server-cache'),
    logFile: join(tmp, 'server.log'),
  });
  const rc = daemon.client;

  const backends = {} as ServerEnv['backends'];

  const webdavPort = await freePort();
  await rc.call('serve/start', { type: 'webdav', fs: root, addr: `127.0.0.1:${webdavPort}`, user: USER, pass: PASS });
  backends.webdav = {
    provider: 'webdav',
    values: { url: `http://127.0.0.1:${webdavPort}/`, username: USER, password: PASS },
    served: root,
  };

  // Nextcloud-style WebDAV: served below /remote.php/dav/files/<user>.
  const ncPort = await freePort();
  await rc.call('serve/start', {
    type: 'webdav',
    fs: root,
    addr: `127.0.0.1:${ncPort}`,
    user: USER,
    pass: PASS,
    baseurl: `/remote.php/dav/files/${USER}`,
  });
  backends.nextcloud = {
    provider: 'nextcloud',
    values: { url: `http://127.0.0.1:${ncPort}`, username: USER, password: PASS },
    served: root,
  };

  return {
    root,
    tmp,
    daemon,
    backends,
    async stop() {
      await daemon.stop();
      rmSync(tmp, { recursive: true, force: true });
    },
  };
}

let mtimeClock = Math.floor(Date.now() / 1000) - 100_000;

/** One simulated machine running Alto. */
export class TestClient {
  readonly name: string;
  readonly dir: string;
  readonly alto: Alto;
  readonly daemon: RcloneDaemon;
  /** What went to the trash, relative to the synced folder (with `{ trash: true }`). */
  readonly trashed: string[];
  folderId = '';

  private constructor(name: string, dir: string, daemon: RcloneDaemon, alto: Alto, trashed: string[]) {
    this.name = name;
    this.dir = dir;
    this.daemon = daemon;
    this.alto = alto;
    this.trashed = trashed;
  }

  /** `trash: true` gives the client a trash (a folder beside the synced one), as the app has. */
  static async create(env: ServerEnv, name: string, options: { trash?: boolean } = {}): Promise<TestClient> {
    const base = join(env.tmp, name);
    const dir = join(base, 'sync');
    mkdirSync(dir, { recursive: true });
    const daemon = await RcloneDaemon.start({
      binary: RCLONE,
      configPath: join(base, 'rclone.conf'),
      cacheDir: join(base, 'cache'),
      logFile: join(base, 'rclone.log'),
    });
    const trashed: string[] = [];
    const trashDir = join(base, 'trash');
    const trash = options.trash
      ? async (path: string) => {
          trashed.push(relative(dir, path));
          mkdirSync(trashDir, { recursive: true });
          renameSync(path, join(trashDir, `${trashed.length}-${basename(path)}`));
        }
      : undefined;
    const localFs = new NodeLocalFs({ homeDir: base, watch: false, trash });
    const alto = new Alto({
      rclone: daemon.client,
      storage: new MemoryStorage(),
      platform: { localFs, hostName: name, openAuthUrl: () => {} },
      autoSync: false,
    });
    await alto.start();
    return new TestClient(name, dir, daemon, alto, trashed);
  }

  async connect(env: ServerEnv, backend: Backend, remotePath: string): Promise<void> {
    const b = env.backends[backend];
    const created = await this.alto.createRemote({ provider: b.provider, name: 'server', values: b.values });
    if (!created.ok) throw new Error(`createRemote failed: ${JSON.stringify(created.error)}`);
    const added = await this.alto.addFolder({
      remote: 'server',
      localPath: this.dir,
      remotePath,
    });
    if (!added.ok) throw new Error(`addFolder failed: ${JSON.stringify(added.error)}`);
    this.folderId = added.value.id;
  }

  get folder(): SyncFolder {
    const folder = this.alto.engine.get(this.folderId);
    if (!folder) throw new Error('no folder');
    return folder;
  }

  /** Run sync cycles until the folder settles (no immediate re-sync requested). */
  async sync(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await this.folder.sync();
      if (!this.folder.needsResync) break;
    }
    const { phase, message } = this.folder.runtime;
    if (phase === 'error' || phase === 'offline') throw new Error(`${this.name} sync failed: ${message}`);
  }

  get issues() {
    return this.folder.runtime.issues;
  }

  path(rel: string): string {
    return join(this.dir, rel);
  }

  /** Write a file with a distinct, strictly increasing mtime. */
  write(rel: string, content: string): void {
    const p = this.path(rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
    mtimeClock += 10;
    utimesSync(p, mtimeClock, mtimeClock);
  }

  read(rel: string): string | null {
    const p = this.path(rel);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  }

  exists(rel: string): boolean {
    return existsSync(this.path(rel));
  }

  remove(rel: string): void {
    rmSync(this.path(rel), { recursive: true, force: true });
  }

  mkdir(rel: string): void {
    mkdirSync(this.path(rel), { recursive: true });
  }

  /** All paths (files and folders) in the local folder, sorted. */
  tree(): string[] {
    return listTree(this.dir);
  }

  async close(): Promise<void> {
    await this.alto.stop();
    await this.daemon.stop();
  }
}

export function listTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      out.push(rel);
      if (statSync(join(dir, name)).isDirectory()) walk(join(dir, name), rel);
    }
  };
  walk(root, '');
  return out;
}

/** Read a file directly from the server's storage. */
export function serverRead(env: ServerEnv, rel: string): string | null {
  const p = join(env.root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

export function serverTree(env: ServerEnv, rel: string): string[] {
  return listTree(join(env.root, rel));
}

/** Write a file directly into the server's storage (simulating another app). */
export function serverWrite(env: ServerEnv, rel: string, content: string): void {
  const p = join(env.root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  mtimeClock += 10;
  utimesSync(p, mtimeClock, mtimeClock);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
