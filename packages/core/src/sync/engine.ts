import PQueue from 'p-queue';
import { EXCLUSION_FILE_NAME } from '../exclusions.ts';
import type { Platform } from '../platform.ts';
import type { RcloneClient } from '../rclone/client.ts';
import type { AltoStorage, FolderRecord } from '../storage.ts';
import { type RemoteFsInfo, SETTLE_TIME, SyncFolder } from './folder.ts';

export interface SyncEngineOptions {
  rclone: RcloneClient;
  storage: AltoStorage;
  platform: Platform;
  /** How often to check remotes for changes, in ms. Default 30 s. */
  pollInterval?: number;
  /** Delay after a local change before syncing it, in ms (restarted by every change). Default 0.5 s. */
  debounce?: number;
  /** Folders synced at the same time. Default 2. */
  folderConcurrency?: number;
  /** Parallel transfers per folder. Default 4. */
  transferConcurrency?: number;
  /** Called whenever any folder's runtime state changes. */
  onChange?: () => void;
}

/** Immediate retries (a cycle asking for another) allowed before falling back to the poll interval. */
const MAX_IMMEDIATE_RERUNS = 3;
/** More changed paths than this are synced with a full cycle. */
const MAX_CHANGED_PATHS = 200;

/**
 * Why a cycle is scheduled: `now` for a full cycle on request, `poll` for the
 * periodic full check, `local` for the paths the file watcher reported.
 */
type Reason = 'now' | 'poll' | 'local';

interface Scheduled {
  folder: SyncFolder;
  timer: ReturnType<typeof setTimeout> | null;
  timerReason: Reason;
  timerDue: number;
  queued: boolean;
  /** The next cycle must be a full one. */
  full: boolean;
  /** Local paths changed since the last cycle started (relative to the folder). */
  changed: Set<string>;
  /** Changes arrived while a cycle was running. */
  dirtyWhileRunning: boolean;
  reruns: number;
  unwatch: (() => void) | null;
}

/**
 * Schedules sync cycles for all folders: for local changes (debounced, only
 * the changed paths), on a polling interval for remote changes (full), and on
 * demand (full).
 */
export class SyncEngine {
  private readonly opts: Required<Omit<SyncEngineOptions, 'onChange'>> & {
    onChange: () => void;
  };
  private readonly folders = new Map<string, Scheduled>();
  private readonly queue: PQueue;
  private readonly remoteInfo = new Map<string, Promise<RemoteFsInfo>>();
  private running = false;

  constructor(options: SyncEngineOptions) {
    const defined = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) as SyncEngineOptions;
    this.opts = {
      pollInterval: 30_000,
      debounce: 500,
      folderConcurrency: 2,
      transferConcurrency: 4,
      onChange: () => {},
      ...defined,
    };
    this.queue = new PQueue({ concurrency: this.opts.folderConcurrency });
  }

  get list(): SyncFolder[] {
    return [...this.folders.values()].map((s) => s.folder);
  }

  get(id: string): SyncFolder | undefined {
    return this.folders.get(id)?.folder;
  }

  /** Cached `fsinfo` for a remote. */
  getRemoteInfo = (remote: string, signal?: AbortSignal): Promise<RemoteFsInfo> => {
    let info = this.remoteInfo.get(remote);
    if (!info) {
      info = this.opts.rclone.fsInfo(`${remote}:`, { signal }).then((fi) => ({
        precision: fi.Precision,
        hashes: fi.Hashes ?? [],
        caseInsensitive: Boolean(fi.Features?.CaseInsensitive),
      }));
      info.catch(() => this.remoteInfo.delete(remote));
      this.remoteInfo.set(remote, info);
    }
    return info;
  };

  forgetRemoteInfo(remote: string): void {
    this.remoteInfo.delete(remote);
  }

  start(): void {
    this.running = true;
    for (const id of this.folders.keys()) this.requestSync(id, 0);
  }

  /** Stop syncing, resolving once running cycles have wound down. */
  async stop(): Promise<void> {
    this.running = false;
    this.queue.clear();
    const stopping = [...this.folders.values()].map((s) => {
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      return s.folder.cancel();
    });
    await Promise.all(stopping);
  }

  add(record: FolderRecord): SyncFolder {
    const existing = this.folders.get(record.id);
    if (existing) return existing.folder;

    const folder = new SyncFolder(record, {
      rclone: this.opts.rclone,
      storage: this.opts.storage,
      platform: this.opts.platform,
      concurrency: this.opts.transferConcurrency,
      getRemoteInfo: this.getRemoteInfo,
      onChange: this.opts.onChange,
    });
    const scheduled: Scheduled = {
      folder,
      timer: null,
      timerReason: 'now',
      timerDue: 0,
      queued: false,
      full: true,
      changed: new Set(),
      dirtyWhileRunning: false,
      reruns: 0,
      unwatch: null,
    };
    this.folders.set(record.id, scheduled);

    const watch = this.opts.platform.localFs.watch;
    if (watch) {
      try {
        scheduled.unwatch = watch.call(this.opts.platform.localFs, record.localPath, (relPath) => {
          // The root, or the exclusion file (which changes what every path means): everything.
          if (!relPath || relPath === EXCLUSION_FILE_NAME) scheduled.full = true;
          else scheduled.changed.add(relPath);
          this.schedule(scheduled, this.opts.debounce, 'local');
        });
      } catch (err) {
        this.opts.platform.log?.('warn', `Unable to watch ${record.localPath}`, err);
      }
    }

    this.opts.onChange();
    if (this.running) this.requestSync(record.id, 0);
    return folder;
  }

  async remove(id: string): Promise<void> {
    const s = this.folders.get(id);
    if (!s) return;
    this.folders.delete(id);
    if (s.timer) clearTimeout(s.timer);
    s.unwatch?.();
    await s.folder.destroy();
    this.opts.onChange();
  }

  /** Schedule a full sync of one folder after `delay` ms (coalescing repeated requests). */
  requestSync(id: string, delay = 0): void {
    const s = this.folders.get(id);
    if (s) this.schedule(s, delay, 'now');
  }

  private schedule(s: Scheduled, delay: number, reason: Reason): void {
    if (!this.running) return;
    if (reason === 'now') s.full = true;
    if (s.folder.busy) {
      // Picked up once the running cycle ends.
      if (reason !== 'poll') s.dirtyWhileRunning = true;
      return;
    }
    if (s.queued) return;
    const due = Date.now() + delay;
    if (s.timer) {
      // Local changes restart their own wait, but never put off an earlier cycle.
      const debounce = reason === 'local' && s.timerReason === 'local';
      if (!debounce && s.timerDue <= due) return;
      clearTimeout(s.timer);
    }
    s.timerReason = reason;
    s.timerDue = due;
    s.timer = setTimeout(() => {
      s.timer = null;
      if (reason === 'poll') s.full = true;
      this.enqueue(s);
    }, delay);
  }

  /** Sync every folder (or the folders of one remote) now. */
  syncAll(remote?: string): void {
    for (const s of this.folders.values()) {
      if (!remote || s.folder.record.remote === remote) {
        s.reruns = 0;
        this.requestSync(s.folder.id, 0);
      }
    }
  }

  private enqueue(s: Scheduled): void {
    if (s.queued || !this.folders.has(s.folder.id)) return;
    s.queued = true;
    void this.queue.add(async () => {
      s.queued = false;
      if (!this.folders.has(s.folder.id) || !this.running) return;
      s.dirtyWhileRunning = false;
      const full = s.full || s.changed.size === 0 || s.changed.size > MAX_CHANGED_PATHS;
      const paths = [...s.changed];
      s.full = false;
      s.changed.clear();
      if (full) await s.folder.sync();
      else await s.folder.syncPaths(paths);
      if (!this.folders.has(s.folder.id) || !this.running) return;

      for (const path of s.folder.settling) s.changed.add(path);
      if (s.folder.needsResync && s.reruns < MAX_IMMEDIATE_RERUNS) {
        s.reruns += 1;
        this.schedule(s, 250, 'now');
      } else if (s.dirtyWhileRunning) {
        // Changes made during the cycle are always followed up.
        this.schedule(s, this.opts.debounce, s.full ? 'now' : 'local');
      } else if (s.folder.settling.length > 0) {
        this.schedule(s, SETTLE_TIME, 'local');
      } else {
        s.reruns = 0;
        this.schedule(s, this.opts.pollInterval, 'poll');
      }
    });
  }
}
