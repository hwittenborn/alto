/**
 * A pretend Alto for the website's demo, over the same `AltoTransport` the app
 * uses in Electron, but nothing leaves the page. The page adds accounts
 * (`connect`), whose folders "sync" on a timer. The demo only reads state, so
 * there are no actions to answer.
 */
import {
  type AltoState,
  type AltoTransport,
  type FolderView,
  getProvider,
  initialState,
  overallStatus,
  type RemoteView,
} from '@alto/core';
import { SITE_PROVIDERS, type SiteProviderId } from '../lib/providers';

const HOME = '/home/you';
const GiB = 1024 ** 3;

/** What each provider's pretend account looks like. */
const ACCOUNTS: Record<SiteProviderId, { account: string; used: number; total: number }> = {
  gdrive: { account: 'you@gmail.com', used: 9.4 * GiB, total: 15 * GiB },
  dropbox: { account: 'you@example.com', used: 1.2 * GiB, total: 2 * GiB },
  onedrive: { account: 'you@outlook.com', used: 3.8 * GiB, total: 5 * GiB },
  protondrive: { account: 'you@protonmail.com', used: 2.7 * GiB, total: 5 * GiB },
  nextcloud: { account: 'you@cloud.example.com', used: 41 * GiB, total: 100 * GiB },
};

/** The folders each account syncs: a folder in the home folder, and where on the server. */
const ACCOUNT_FOLDERS: Record<SiteProviderId, Array<[local: string, remote: string]>> = {
  gdrive: [
    ['Documents', 'Documents'],
    ['Pictures', 'Photos'],
    ['School', 'School'],
  ],
  dropbox: [
    ['Projects', 'Projects'],
    ['Desktop', 'Desktop'],
  ],
  onedrive: [
    ['Work', 'Work'],
    ['Videos', 'Videos'],
  ],
  protondrive: [
    ['Notes', 'Notes'],
    ['Taxes', 'Documents/Taxes'],
  ],
  nextcloud: [
    ['Music', 'Music'],
    ['Recipes', 'Shared/Recipes'],
  ],
};

/** File names a sync shows going past. */
const FILES = [
  'Budget 2026.ods',
  'IMG_2041.jpg',
  'IMG_2042.jpg',
  'notes/meeting.md',
  'Thesis draft v7.odt',
  'garden.svg',
  'Recipes/Sourdough.md',
  'Vacation/beach.png',
  'invoice-0412.pdf',
  'scan_001.pdf',
  'playlist.m3u',
  'README.md',
];

/** The conflict a posed folder shows (pose's `conflict`): a file changed on both sides. */
export const CONFLICT = (now: number) => ({
  id: 'conflict:Thesis draft v7.odt',
  kind: 'conflict' as const,
  path: 'Thesis draft v7.odt',
  reason: 'both-modified' as const,
  local: { isDir: false, size: 2_480_000, mtime: now - 18 * 60_000 },
  remote: { isDir: false, size: 2_512_000, mtime: now - 41 * 60_000 },
  detectedAt: now - 2 * 60_000,
});

type Listener = (state: AltoState) => void;

export class FakeAlto {
  private state: AltoState = { ...initialState(HOME, 'laptop'), rcloneVersion: 'v1.71.2' };
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  constructor() {
    // Starting up takes a moment, as it would with rclone starting.
    setTimeout(() => this.update((s) => (s.ready = true)), 350);
  }

  // ---- AltoTransport ----

  readonly transport: AltoTransport = {
    invoke: async (method) => {
      throw new Error(`The demo doesn't support ${method}`);
    },
    getState: async () => this.snapshot(),
    onState: (listener) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },
  };

  // ---- What the website can do to the demo ----

  /**
   * Add an account of `provider`, with its folders (ACCOUNT_FOLDERS), which
   * start syncing. The first account's first folder has a big sync, to watch
   * while the others arrive.
   */
  connect(provider: SiteProviderId): void {
    const first = this.state.remotes.length === 0;
    const name = this.addRemoteNow(provider);
    const ids = ACCOUNT_FOLDERS[provider].map(([local, remote]) =>
      this.addFolderNow(name, this.freeLocalPath(local), remote),
    );
    this.emit();
    ids.forEach((id, i) => this.runSync(id, first && i === 0 ? 64 : undefined));
  }

  /** Remove every account and folder. */
  reset(): void {
    for (const id of this.timers.keys()) this.stopSync(id);
    this.update((s) => {
      s.remotes = [];
      s.folders = [];
    });
  }

  /**
   * Every account with its folders, held still for a picture (the media
   * pages, src/app/media): the first folder partway through a sync, the rest
   * synced a few minutes ago. Nothing moves afterwards. Returns the accounts'
   * names, for the page to mark them arrived.
   */
  pose(now = Date.now(), { conflict = false }: { conflict?: boolean } = {}): string[] {
    this.reset();
    const names = SITE_PROVIDERS.map((provider, p) => {
      const name = this.addRemoteNow(provider);
      ACCOUNT_FOLDERS[provider].forEach(([local, remote], i) => {
        const id = this.addFolderNow(name, this.freeLocalPath(local), remote);
        this.updateFolderNow(id, (f) => {
          f.runtime.lastCheckedAt = now - (2 + p + i) * 60_000;
          if (conflict && p === 0 && i === 2) {
            // School: a file changed here and on the server since the last sync.
            f.runtime.issues = [CONFLICT(now)];
          }
          if (p === 0 && i === 0) {
            f.runtime.phase = 'syncing';
            f.runtime.progress = {
              done: 23,
              total: 64,
              current: [
                { op: 'upload', path: 'Thesis draft v7.odt' },
                { op: 'upload', path: 'IMG_2041.jpg' },
              ],
              bytesDone: 41_200_000,
              bytesTotal: 118_000_000,
              speed: 3_100_000,
            };
          }
        });
      });
      return name;
    });
    this.state.ready = true;
    this.emit();
    return names;
  }

  /** `name` in the home folder, or a numbered one if another folder syncs it already. */
  private freeLocalPath(name: string): string {
    const used = new Set(this.state.folders.map((f) => f.localPath));
    let path = `${HOME}/${name}`;
    for (let n = 2; used.has(path); n++) path = `${HOME}/${name} ${n}`;
    return path;
  }

  // ---- Pretend syncing ----

  /** Check, then sync a handful of files (or `files`) with progress, then rest as synced. */
  private runSync(id: string, files?: number) {
    const total = files ?? 6 + Math.floor(Math.random() * 10);
    const sizes = Array.from({ length: total }, () => 40_000 + Math.floor(Math.random() * 3_000_000));
    const bytesTotal = sizes.reduce((a, b) => a + b, 0);
    let done = 0;
    let bytesDone = 0;
    this.updateFolder(id, (f) => {
      f.runtime.phase = 'checking';
      f.runtime.progress = null;
    });
    const step = () => {
      if (done >= total) {
        this.timers.delete(id);
        this.updateFolder(id, (f) => {
          f.runtime.phase = 'idle';
          f.runtime.progress = null;
          f.runtime.lastCheckedAt = Date.now();
        });
        return;
      }
      const offset = Math.floor(Math.random() * FILES.length);
      this.updateFolder(id, (f) => {
        f.runtime.phase = 'syncing';
        f.runtime.progress = {
          done,
          total,
          // Both the same way the whole sync, so the status line stays put
          // ("Uploading 2 files…") rather than flipping to "Syncing 2 items…".
          current: [
            { op: 'upload', path: FILES[(offset + done) % FILES.length]! },
            { op: 'upload', path: FILES[(offset + done + 5) % FILES.length]! },
          ],
          bytesDone,
          bytesTotal,
          speed: 2_400_000 + Math.random() * 1_800_000,
        };
      });
      bytesDone += sizes[done]!;
      done++;
      this.timers.set(id, setTimeout(step, 450));
    };
    // A moment of checking first.
    this.timers.set(id, setTimeout(step, 1350));
  }

  private stopSync(id: string) {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }

  // ---- State ----

  private addRemoteNow(provider: SiteProviderId): string {
    const label = getProvider(provider).label;
    let unique = label;
    for (let n = 2; this.state.remotes.some((r) => r.name === unique); n++) unique = `${label} ${n}`;
    const info = ACCOUNTS[provider];
    const remote: RemoteView = {
      name: unique,
      provider,
      account: info.account,
      usage: { used: info.used, total: info.total, free: info.total - info.used },
    };
    // In the order they're added, so each new one lands at the bottom of the sidebar.
    this.state.remotes.push(remote);
    return unique;
  }

  private addFolderNow(remote: string, localPath: string, remotePath: string): string {
    const id = `folder-${this.nextId++}`;
    const folder: FolderView = {
      id,
      remote,
      localPath,
      remotePath,
      addedAt: Date.now(),
      runtime: { phase: 'idle', message: null, lastCheckedAt: Date.now(), progress: null, issues: [] },
    };
    this.state.folders.push(folder);
    return id;
  }

  private updateFolderNow(id: string, change: (f: FolderView) => void) {
    const folder = this.state.folders.find((f) => f.id === id);
    if (folder) change(folder);
  }

  private updateFolder(id: string, change: (f: FolderView) => void) {
    this.update((s) => {
      const folder = s.folders.find((f) => f.id === id);
      if (folder) change(folder);
    });
  }

  private update(change: (s: AltoState) => void) {
    change(this.state);
    this.emit();
  }

  private emit() {
    this.state.revision++;
    this.state.overall = overallStatus(this.state.folders);
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  /** A copy, as it would arrive over IPC: the store mustn't share objects with this. */
  private snapshot(): AltoState {
    return structuredClone(this.state);
  }
}
