import PQueue from 'p-queue';
import { EXCLUSION_FILE_NAME, Exclusions } from '../exclusions.ts';

import { baseName, depth, formatLocalPath, isWithin, joinPath, parentPath, splitExtension } from '../paths.ts';
import type { Platform } from '../platform.ts';
import { type RcloneClient, RcloneError } from '../rclone/client.ts';
import { parseRcloneTime, precisionToToleranceMs } from '../rclone/time.ts';
import type { RcloneListItem } from '../rclone/types.ts';
import type { AltoStorage, FolderRecord } from '../storage.ts';
import { conflictIssueId, errorIssueId, massDeletionIssueId, type SyncIssue } from './issues.ts';
import { countBaselineFiles, matchesSnapshot, planSync } from './planner.ts';
import {
  type Baseline,
  type BaselineEntry,
  type DeletedItem,
  type ItemState,
  type Listing,
  otherSide,
  type PlanAction,
  type Side,
  type SideSnapshot,
} from './types.ts';

export type FolderPhase = 'idle' | 'checking' | 'syncing' | 'offline' | 'error' | 'paused';

export type TransferOp =
  'upload' | 'download' | 'delete-local' | 'delete-remote' | 'mkdir-local' | 'mkdir-remote' | 'verify';

export interface FolderProgress {
  done: number;
  total: number;
  current: Array<{ op: TransferOp; path: string }>;
  bytesDone: number;
  bytesTotal: number;
  /** Bytes per second. */
  speed: number;
}

export interface FolderRuntime {
  phase: FolderPhase;
  /** Detail for the `offline` and `error` phases. */
  message: string | null;
  /** When both sides were last compared in full (a completed sync cycle). */
  lastCheckedAt: number | null;
  progress: FolderProgress | null;
  issues: SyncIssue[];
}

export interface RemoteFsInfo {
  /** Modification time precision in ns. */
  precision: number;
  hashes: string[];
  caseInsensitive: boolean;
}

export interface SyncFolderDeps {
  rclone: RcloneClient;
  storage: AltoStorage;
  platform: Platform;
  /** Parallel transfers per folder. */
  concurrency: number;
  getRemoteInfo(remote: string, signal?: AbortSignal): Promise<RemoteFsInfo>;
  onChange(): void;
}

export type ConflictChoice = 'local' | 'remote' | 'both';

export interface ConflictResolution {
  /**
   * - `resolved`: the chosen version was applied.
   * - `gone`: neither item exists anymore; the conflict was dropped.
   * - `local-only` / `remote-only`: only one item exists anymore, so it was synced.
   */
  outcome: 'resolved' | 'gone' | 'local-only' | 'remote-only';
  /** For `both`: the name the local copy was saved under. */
  conflictCopy?: string;
}

/** Thrown inside a cycle when the folder is being removed or the app quits. */
class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

/** Minimum number of files a sync must want to delete before the guard can trip. */
const MASS_DELETION_MIN = 10;
/** Fraction of the synced files that, when deleted on one side at once, needs confirmation. */
const MASS_DELETION_FRACTION = 0.5;

/**
 * Local files changed this recently may still be being written: a cycle
 * leaves them alone, and they're synced once they've settled.
 */
export const SETTLE_TIME = 2_000;

/**
 * How often, and how many times at most, a stopped upload's partial file is
 * looked at until it stays the same: the server may still be writing out what
 * it had received, and then set the file's time.
 */
const PARTIAL_SETTLE_INTERVAL = 1_000;
const PARTIAL_SETTLE_CHECKS = 10;

/** A side's snapshot that no item matches: the item counts as changed on that side. */
const CHANGED: SideSnapshot = { size: -2, mtime: -2 };

function sameState(a: ItemState | null, b: ItemState | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.isDir !== b.isDir) return false;
  if (a.isDir) return true;
  return a.size === b.size && a.mtime === b.mtime;
}

function toItemState(item: RcloneListItem): ItemState {
  return {
    isDir: item.IsDir,
    size: item.IsDir ? -1 : item.Size,
    mtime: parseRcloneTime(item.ModTime),
  };
}

function baselineEntry(local: ItemState, remote: ItemState): BaselineEntry {
  return {
    isDir: local.isDir,
    local: { size: local.size, mtime: local.mtime },
    remote: { size: remote.size, mtime: remote.mtime },
  };
}

/** Everything a plan deletes on one side, including what's inside deleted folders. */
function deletionsOn(actions: PlanAction[], side: Side): DeletedItem[] {
  return actions
    .filter((a): a is Extract<PlanAction, { type: 'delete' }> => a.type === 'delete' && a.side === side)
    .flatMap((a) => [a, ...(a.contents ?? [])]);
}

function errorMessage(err: unknown): string {
  if (err instanceof RcloneError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Transient failures that resolve themselves on the next cycle; not worth showing. */
function isTransient(err: unknown): boolean {
  return /source file is being updated|can't copy - source file is being updated|file changed as we read it/i.test(
    errorMessage(err),
  );
}

/**
 * One local folder paired with a folder on a remote, and everything needed to
 * keep the two in sync: listing, planning, executing and conflict resolution.
 *
 * All mutating work is serialised through an internal lock so a sync cycle,
 * a conflict resolution and removal never interleave.
 */
export class SyncFolder {
  readonly record: FolderRecord;
  runtime: FolderRuntime = {
    phase: 'idle',
    message: null,
    lastCheckedAt: null,
    progress: null,
    issues: [],
  };
  /** Set when something changed mid-cycle and another cycle should follow right away. */
  needsResync = false;
  /** Local files the last cycle left alone because they were still changing (see SETTLE_TIME). */
  settling: string[] = [];

  private readonly deps: SyncFolderDeps;
  private baseline: Baseline | null = null;
  private cycleRunning = false;
  private readonly pendingBaseline = new Map<string, BaselineEntry | null>();
  private readonly issues = new Map<string, SyncIssue>();
  private readonly allowMassDeletion = new Set<Side>();
  private readonly heldDeletions = new Map<Side, string[]>();
  private lock: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  /** Signal of the operation currently holding the lock. */
  private signal: AbortSignal = this.abort.signal;
  private destroyed = false;

  constructor(record: FolderRecord, deps: SyncFolderDeps) {
    this.record = record;
    this.deps = deps;
    if (record.paused) this.runtime.phase = 'paused';
  }

  get id(): string {
    return this.record.id;
  }

  /** rclone fs string for the local side. */
  get localFs(): string {
    return this.record.localPath;
  }

  /** rclone fs string for the remote side. */
  get remoteFs(): string {
    return `${this.record.remote}:${this.record.remotePath}`;
  }

  /** Whether a cycle is running: the engine follows up on what's asked for meanwhile once it ends. */
  get busy(): boolean {
    return this.cycleRunning;
  }

  private fs(side: Side): string {
    return side === 'local' ? this.localFs : this.remoteFs;
  }

  private update(patch: Partial<FolderRuntime>): void {
    this.runtime = { ...this.runtime, ...patch, issues: [...this.issues.values()] };
    this.deps.onChange();
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const start = () => {
      this.signal = this.abort.signal;
      return fn();
    };
    const run = this.lock.then(start, start);
    this.lock = run.catch(() => {});
    return run;
  }

  private checkCancelled(): void {
    if (this.signal.aborted) throw new CancelledError();
  }

  // --- baseline ------------------------------------------------------------

  private async loadBaseline(): Promise<Baseline> {
    if (!this.baseline) this.baseline = await this.deps.storage.loadBaseline(this.id);
    return this.baseline;
  }

  private setBaseline(path: string, entry: BaselineEntry | null): void {
    if (!this.baseline) return;
    if (entry) this.baseline.set(path, entry);
    else this.baseline.delete(path);
    this.pendingBaseline.set(path, entry);
  }

  private async flushBaseline(): Promise<void> {
    if (this.pendingBaseline.size === 0 || this.destroyed) return;
    const upserts = new Map<string, BaselineEntry>();
    const deletes = new Set<string>();
    for (const [path, entry] of this.pendingBaseline) {
      if (entry) upserts.set(path, entry);
      else deletes.add(path);
    }
    this.pendingBaseline.clear();
    await this.deps.storage.updateBaseline(this.id, { upserts, deletes });
  }

  // --- issues --------------------------------------------------------------

  private addIssue(issue: SyncIssue, into: Map<string, SyncIssue>): void {
    const existing = this.issues.get(issue.id);
    into.set(issue.id, existing ? { ...issue, detectedAt: existing.detectedAt } : issue);
  }

  dismissIssue(issueId: string): void {
    const issue = this.issues.get(issueId);
    if (!issue || issue.kind === 'conflict') return;
    this.issues.delete(issueId);
    if (issue.kind === 'mass-deletion') this.heldDeletions.delete(issue.side);
    this.update({});
  }

  // --- listing -------------------------------------------------------------

  private async statSide(side: Side, path: string): Promise<ItemState | null> {
    try {
      const item = await this.deps.rclone.stat(
        this.fs(side),
        path,
        { noMimeType: true },
        {
          signal: this.signal,
        },
      );
      return item ? toItemState(item) : null;
    } catch (err) {
      if (err instanceof RcloneError && err.isNotFound) return null;
      throw err;
    }
  }

  private async listSide(side: Side): Promise<Listing> {
    const items = await this.deps.rclone.list(
      this.fs(side),
      '',
      { recurse: true, noMimeType: true },
      { signal: this.signal },
    );
    const listing: Listing = new Map();
    for (const item of items) listing.set(item.Path, toItemState(item));
    return listing;
  }

  /** `path` and everything inside it on one side (empty when it doesn't exist). */
  private async listSubtree(side: Side, path: string): Promise<Listing> {
    const listing: Listing = new Map();
    const item = await this.statSide(side, path);
    if (!item) return listing;
    listing.set(path, item);
    if (item.isDir) {
      const items = await this.deps.rclone.list(
        this.fs(side),
        path,
        { recurse: true, noMimeType: true },
        { signal: this.signal },
      );
      for (const child of items) listing.set(child.Path, toItemState(child));
    }
    return listing;
  }

  private async readExclusions(): Promise<Exclusions> {
    const text = await this.deps.platform.localFs.readTextFile(joinPath(this.record.localPath, EXCLUSION_FILE_NAME));
    return Exclusions.parse(text ?? '');
  }

  // --- cycle ---------------------------------------------------------------

  /** Run one full sync cycle. Safe to call while another is running (they queue). */
  sync(): Promise<void> {
    return this.withLock(() => this.runCycle());
  }

  /**
   * Sync only these paths (and what's inside them): local changes the file
   * watcher reported. Only they are compared, so a change doesn't wait for
   * both sides to be listed in full. The planner and the safety checks are a
   * full cycle's; anything a narrow cycle can't judge falls back to one.
   */
  syncPaths(paths: readonly string[]): Promise<void> {
    // Paths inside another one are covered by it.
    const scope = [...new Set(paths)].filter((p) => !paths.some((other) => other !== p && isWithin(p, other)));
    return this.withLock(() => this.runCycle(scope));
  }

  private async runCycle(scope?: string[]): Promise<void> {
    if (this.destroyed || this.record.paused) return;
    this.cycleRunning = true;
    try {
      await this.cycle(scope);
    } finally {
      this.cycleRunning = false;
    }
  }

  private async cycle(scope?: string[]): Promise<void> {
    this.needsResync = false;
    this.settling = [];
    this.update({ phase: 'checking', message: null, progress: null });

    const cycleIssues = new Map<string, SyncIssue>();
    const now = Date.now();
    const pushError = (path: string, message: string) =>
      this.addIssue({ id: errorIssueId(path, message), kind: 'error', path, message, detectedAt: now }, cycleIssues);

    try {
      const localFs = this.deps.platform.localFs;
      const root = await localFs.stat(this.record.localPath);
      if (!root?.isDir) {
        // Never propagate a vanished local folder (unmounted drive, moved folder…).
        this.update({
          phase: 'error',
          message: `The local folder '${formatLocalPath(this.record.localPath, localFs.homeDir)}' doesn't exist.`,
        });
        return;
      }

      const info = await this.deps.getRemoteInfo(this.record.remote, this.signal);
      const tolerance = precisionToToleranceMs(info.precision);
      const synced = await this.loadBaseline();

      if (scope) {
        const narrowed = await this.planPaths(scope, synced, tolerance, info);
        if (narrowed) {
          await this.runNarrowCycle(scope, narrowed, info, now);
          return;
        }
      }

      let remoteRootMissing = false;
      const [local, remote] = await Promise.all([
        this.listSide('local'),
        this.listSide('remote').catch((err) => {
          if (err instanceof RcloneError && err.isDirNotFound) {
            remoteRootMissing = true;
            return new Map() as Listing;
          }
          throw err;
        }),
      ]);
      this.checkCancelled();
      const baseline = this.holdBackSettling(local, remote, synced);

      // Sync the shared exclusion file first, so rules changed on another
      // client apply to this very cycle.
      const ignorePlan = planSync({
        local,
        remote,
        baseline,
        mtimeTolerance: tolerance,
        only: [EXCLUSION_FILE_NAME],
      });
      if (ignorePlan.actions.length > 0) {
        if (remoteRootMissing) await this.ensureRemoteRoot();
        remoteRootMissing = false;
        await this.execute(ignorePlan.actions, info, cycleIssues, pushError);
      }
      for (const map of [local, remote]) map.delete(EXCLUSION_FILE_NAME);
      const exclusions = await this.readExclusions();
      const restBaseline = new Map(baseline);
      restBaseline.delete(EXCLUSION_FILE_NAME);

      const plan = planSync({
        local,
        remote,
        baseline: restBaseline,
        exclusions,
        mtimeTolerance: tolerance,
        remoteCaseInsensitive: info.caseInsensitive,
      });

      // Guard against propagating a mass deletion (wrong folder emptied,
      // remote folder wiped by another client, …) without confirmation.
      const totalFiles = countBaselineFiles(restBaseline);
      let held = false;
      for (const side of ['local', 'remote'] as const) {
        const deletions = deletionsOn(plan.actions, side);
        const fileDeletions = deletions.filter((a) => !a.expected.isDir).length;
        if (this.isMassDeletion(side, fileDeletions, totalFiles)) {
          held = true;
          this.heldDeletions.set(
            side,
            deletions.map((a) => a.path),
          );
          this.addIssue(
            {
              id: massDeletionIssueId(side),
              kind: 'mass-deletion',
              side,
              count: fileDeletions,
              total: totalFiles,
              detectedAt: now,
            },
            cycleIssues,
          );
        }
      }

      if (held) {
        // Keep previously detected conflicts visible while waiting.
        for (const issue of this.issues.values()) {
          if (issue.kind === 'conflict') cycleIssues.set(issue.id, issue);
        }
        this.replaceIssues(cycleIssues);
        this.update({ phase: 'idle', progress: null, lastCheckedAt: Date.now() });
        return;
      }

      if (remoteRootMissing && plan.actions.length > 0) await this.ensureRemoteRoot();
      await this.execute(plan.actions, info, cycleIssues, pushError);
      this.allowMassDeletion.clear();
      this.heldDeletions.clear();

      this.replaceIssues(cycleIssues);
      this.update({ phase: 'idle', message: null, progress: null, lastCheckedAt: Date.now() });
    } catch (err) {
      await this.flushBaseline().catch(() => {});
      if (err instanceof CancelledError || this.signal.aborted) {
        this.update({ phase: this.record.paused ? 'paused' : 'idle', progress: null });
        return;
      }
      // Keep last known issues; report the folder-level failure.
      for (const issue of this.issues.values()) cycleIssues.set(issue.id, issue);
      this.replaceIssues(cycleIssues);
      if (err instanceof RcloneError && err.isConnectivity) {
        this.update({ phase: 'offline', message: err.message, progress: null });
      } else {
        this.update({ phase: 'error', message: errorMessage(err), progress: null });
      }
    }
  }

  /**
   * Leave the local changes that may still be being written out of a cycle:
   * files changed since the last sync, in the last SETTLE_TIME. Taking them
   * out of all three maps means the plan doesn't touch them; they're noted for
   * a later cycle. The exclusion file is the exception: Alto writes it whole,
   * and every cycle applies it as it is. Returns the baseline without them.
   */
  private holdBackSettling(local: Listing, remote: Listing, baseline: Baseline): Baseline {
    const now = Date.now();
    const settling = [...local]
      .filter(([path, item]) => {
        if (item.isDir || path === EXCLUSION_FILE_NAME || Math.abs(now - item.mtime) >= SETTLE_TIME) return false;
        const synced = baseline.get(path);
        return !synced || !matchesSnapshot(item, synced.isDir, synced.local);
      })
      .map(([path]) => path);
    if (settling.length === 0) return baseline;
    this.settling.push(...settling);
    const held = new Map(baseline);
    for (const path of settling) {
      local.delete(path);
      remote.delete(path);
      held.delete(path);
    }
    return held;
  }

  private isMassDeletion(side: Side, fileDeletions: number, totalFiles: number): boolean {
    return (
      fileDeletions >= MASS_DELETION_MIN &&
      fileDeletions > totalFiles * MASS_DELETION_FRACTION &&
      !this.allowMassDeletion.has(side)
    );
  }

  /**
   * The plan for just `scope`, from both sides' current state there. Null when
   * only a full cycle can judge it: the exclusion file changed, or the plan
   * deletes enough files for the mass-deletion guard.
   */
  private async planPaths(
    scope: string[],
    baseline: Baseline,
    tolerance: number | null,
    info: RemoteFsInfo,
  ): Promise<PlanAction[] | null> {
    if (scope.some((p) => p === '' || p === EXCLUSION_FILE_NAME)) return null;
    const inScope = (path: string) => scope.some((p) => isWithin(path, p));
    const local: Listing = new Map();
    const remote: Listing = new Map();
    for (const path of scope) {
      let listings: [Listing, Listing];
      try {
        listings = await Promise.all([this.listSubtree('local', path), this.listSubtree('remote', path)]);
      } catch (err) {
        // The remote folder itself is gone: a full cycle knows what to do.
        if (err instanceof RcloneError && err.isDirNotFound) return null;
        throw err;
      }
      for (const [p, item] of listings[0]) local.set(p, item);
      for (const [p, item] of listings[1]) remote.set(p, item);
    }
    this.checkCancelled();
    const narrowBaseline = this.holdBackSettling(
      local,
      remote,
      new Map([...baseline].filter(([path]) => inScope(path))),
    );
    const { actions } = planSync({
      local,
      remote,
      baseline: narrowBaseline,
      exclusions: await this.readExclusions(),
      mtimeTolerance: tolerance,
      remoteCaseInsensitive: info.caseInsensitive,
      only: scope,
    });
    const totalFiles = countBaselineFiles(baseline) - (baseline.get(EXCLUSION_FILE_NAME)?.isDir === false ? 1 : 0);
    for (const side of ['local', 'remote'] as const) {
      const fileDeletions = deletionsOn(actions, side).filter((a) => !a.expected.isDir).length;
      if (this.isMassDeletion(side, fileDeletions, totalFiles)) return null;
    }
    return actions;
  }

  /** Apply a plan for `scope`: issues elsewhere stay as they are. */
  private async runNarrowCycle(scope: string[], actions: PlanAction[], info: RemoteFsInfo, now: number): Promise<void> {
    const cycleIssues = new Map<string, SyncIssue>();
    for (const [id, issue] of this.issues) {
      if (issue.kind === 'mass-deletion' || !scope.some((p) => isWithin(issue.path, p))) cycleIssues.set(id, issue);
    }
    const pushError = (path: string, message: string) =>
      this.addIssue({ id: errorIssueId(path, message), kind: 'error', path, message, detectedAt: now }, cycleIssues);
    await this.execute(actions, info, cycleIssues, pushError);
    this.replaceIssues(cycleIssues);
    this.update({ phase: 'idle', message: null, progress: null });
  }

  private replaceIssues(next: Map<string, SyncIssue>): void {
    this.issues.clear();
    for (const [id, issue] of next) this.issues.set(id, issue);
  }

  private async ensureRemoteRoot(): Promise<void> {
    if (this.record.remotePath === '') return;
    await this.deps.rclone.mkdir(`${this.record.remote}:`, this.record.remotePath, {
      signal: this.signal,
    });
  }

  // --- execution -----------------------------------------------------------

  private async execute(
    actions: PlanAction[],
    info: RemoteFsInfo,
    issues: Map<string, SyncIssue>,
    pushError: (path: string, message: string) => void,
  ): Promise<void> {
    const signal = this.signal;
    const group = `alto-folder-${this.id}`;
    const transfers = actions.filter((a) => ['mkdir', 'copy', 'delete', 'verify', 'replace'].includes(a.type));
    const progress: FolderProgress = {
      done: 0,
      total: transfers.length,
      current: [],
      bytesDone: 0,
      bytesTotal: transfers.reduce((sum, a) => sum + (a.type === 'copy' && a.source.size > 0 ? a.source.size : 0), 0),
      speed: 0,
    };
    // Once paused or stopped, the folder shows that while the transfers wind down.
    const publish = () => {
      if (transfers.length > 0 && !signal.aborted) this.update({ phase: 'syncing', progress: { ...progress } });
    };
    const begin = (op: TransferOp, path: string) => {
      progress.current = [...progress.current, { op, path }];
      publish();
    };
    const end = (path: string) => {
      progress.current = progress.current.filter((c) => c.path !== path);
      progress.done += 1;
      publish();
    };
    publish();

    let completedBytes = 0;
    const poll = setInterval(() => {
      void this.deps.rclone
        .stats(group)
        .then((stats) => {
          progress.speed = stats.speed;
          progress.bytesDone = Math.min(stats.bytes, progress.bytesTotal || stats.bytes);
          publish();
        })
        .catch(() => {});
    }, 1000);

    const queue = new PQueue({ concurrency: Math.max(1, this.deps.concurrency) });
    const guarded = async (path: string, op: TransferOp, fn: () => Promise<void>) => {
      if (signal.aborted) return;
      begin(op, path);
      try {
        await fn();
      } catch (err) {
        if (signal.aborted) return;
        if (isTransient(err)) {
          this.needsResync = true;
        } else {
          pushError(path, errorMessage(err));
        }
      } finally {
        end(path);
      }
    };

    try {
      // 1. Bookkeeping and problems that need no transfers.
      for (const a of actions) {
        if (a.type === 'record') this.setBaseline(a.path, baselineEntry(a.local, a.remote));
        else if (a.type === 'forget') this.setBaseline(a.path, null);
        else if (a.type === 'error') pushError(a.path, a.message);
        else if (a.type === 'conflict') {
          this.addIssue(
            {
              id: conflictIssueId(a.path),
              kind: 'conflict',
              path: a.path,
              reason: a.reason,
              local: a.local,
              remote: a.remote,
              detectedAt: Date.now(),
            },
            issues,
          );
        }
      }

      // 2. Folders, parents first.
      const mkdirs = actions
        .filter((a): a is Extract<PlanAction, { type: 'mkdir' }> => a.type === 'mkdir')
        .sort((a, b) => depth(a.path) - depth(b.path));
      for (const a of mkdirs) {
        await guarded(a.path, a.side === 'local' ? 'mkdir-local' : 'mkdir-remote', async () => {
          await this.deps.rclone.mkdir(this.fs(a.side), a.path, { signal });
          const [l, r] = await Promise.all([this.statSide('local', a.path), this.statSide('remote', a.path)]);
          if (l?.isDir && r?.isDir) this.setBaseline(a.path, baselineEntry(l, r));
        });
      }
      // File replaced by a folder on the other side: swap before filling it.
      for (const a of actions) {
        if (a.type !== 'replace' || !a.source.isDir) continue;
        await guarded(a.path, a.side === 'local' ? 'mkdir-local' : 'mkdir-remote', async () => {
          const current = await this.statSide(a.side, a.path);
          if (!sameState(current, a.expected)) {
            this.needsResync = true;
            return;
          }
          await this.deleteFile(a.side, a.path);
          await this.deps.rclone.mkdir(this.fs(a.side), a.path, { signal });
          const [l, r] = await Promise.all([this.statSide('local', a.path), this.statSide('remote', a.path)]);
          if (l?.isDir && r?.isDir) this.setBaseline(a.path, baselineEntry(l, r));
        });
      }
      await this.flushBaseline();
      this.checkCancelled();

      // 3. Same-sized files changed on both sides: compare contents.
      for (const a of actions) {
        if (a.type !== 'verify') continue;
        void queue.add(() =>
          guarded(a.path, 'verify', async () => {
            const same = await this.sameContents(a.path, info);
            if (same) {
              this.setBaseline(a.path, baselineEntry(a.local, a.remote));
            } else {
              this.addIssue(
                {
                  id: conflictIssueId(a.path),
                  kind: 'conflict',
                  path: a.path,
                  reason: a.reason,
                  local: a.local,
                  remote: a.remote,
                  detectedAt: Date.now(),
                },
                issues,
              );
            }
          }),
        );
      }
      await queue.onIdle();

      // 4. File transfers.
      for (const a of actions) {
        if (a.type !== 'copy') continue;
        void queue.add(() =>
          guarded(a.path, a.from === 'local' ? 'upload' : 'download', async () => {
            const target = otherSide(a.from);
            // Re-check the target right before writing: if it changed since we
            // listed it (another client, or the user), don't overwrite it —
            // the next cycle will see both changes and raise a conflict.
            const current = await this.statSide(target, a.path);
            if (!sameState(current, a.expectedTarget)) {
              this.needsResync = true;
              return;
            }
            try {
              await this.deps.rclone.copyFile(this.fs(a.from), a.path, this.fs(target), a.path, {
                signal,
                group,
              });
            } catch (err) {
              if (a.from === 'local') await this.notePartialUpload(a.path, a.expectedTarget);
              throw err;
            }
            const after = await this.statSide(target, a.path);
            if (!after) throw new Error("The copied file couldn't be found afterwards.");
            completedBytes += Math.max(0, a.source.size);
            progress.bytesDone = Math.max(progress.bytesDone, completedBytes);
            this.setBaseline(
              a.path,
              a.from === 'local' ? baselineEntry(a.source, after) : baselineEntry(after, a.source),
            );
          }),
        );
      }
      await queue.onIdle();
      await this.flushBaseline();
      this.checkCancelled();

      // 5. File deletions.
      for (const a of actions) {
        if (a.type !== 'delete' || a.expected.isDir) continue;
        void queue.add(() =>
          guarded(a.path, a.side === 'local' ? 'delete-local' : 'delete-remote', async () => {
            const current = await this.statSide(a.side, a.path);
            if (current === null) {
              this.setBaseline(a.path, null);
              return;
            }
            // Modified since listing: an edit beats a deletion, retry next cycle.
            if (!sameState(current, a.expected)) {
              this.needsResync = true;
              return;
            }
            await this.deleteFile(a.side, a.path);
            this.setBaseline(a.path, null);
          }),
        );
      }
      await queue.onIdle();
      await this.flushBaseline();
      this.checkCancelled();

      // 6. Folders deleted with everything in them, each in one step: to the
      // trash in one piece here, in one purge on the server. Not if anything
      // inside changed or appeared since the listing: an edit beats a deletion,
      // and the next cycle keeps what's new.
      const folderDeletions = actions.filter(
        (a): a is Extract<PlanAction, { type: 'delete' }> => a.type === 'delete' && a.expected.isDir,
      );
      for (const a of folderDeletions) {
        await guarded(a.path, a.side === 'local' ? 'delete-local' : 'delete-remote', async () => {
          const forget = () => {
            this.setBaseline(a.path, null);
            for (const item of a.contents ?? []) this.setBaseline(item.path, null);
          };
          const current = await this.statSide(a.side, a.path);
          if (current === null) {
            forget();
            return;
          }
          if (!current.isDir || !(await this.holdsOnly(a.side, a.path, a.contents ?? []))) {
            this.needsResync = true;
            return;
          }
          await this.deleteTree(a.side, a.path, current);
          forget();
        });
      }
      await this.flushBaseline();
      this.checkCancelled();

      // 7. Folder replaced by a file on the other side (its contents are gone by now).
      for (const a of actions) {
        if (a.type !== 'replace' || a.source.isDir) continue;
        const from = otherSide(a.side);
        await guarded(a.path, from === 'local' ? 'upload' : 'download', async () => {
          const current = await this.statSide(a.side, a.path);
          if (!current?.isDir) {
            this.needsResync = true;
            return;
          }
          await this.deps.rclone.rmdir(this.fs(a.side), a.path, { signal });
          await this.deps.rclone.copyFile(this.fs(from), a.path, this.fs(a.side), a.path, { signal, group });
          const after = await this.statSide(a.side, a.path);
          if (!after) throw new Error("The copied file couldn't be found afterwards.");
          this.setBaseline(a.path, from === 'local' ? baselineEntry(a.source, after) : baselineEntry(after, a.source));
        });
      }
      await this.flushBaseline();
    } finally {
      clearInterval(poll);
      queue.clear();
      void this.deps.rclone.deleteStats(group).catch(() => {});
    }
  }

  /**
   * An upload that stopped part way (paused, quit, a lost connection) leaves
   * part of the file on servers that write in place, such as WebDAV
   * servers. Record that partial file as what this side last saw there, so the
   * next cycle uploads the file again instead of finding a conflict.
   */
  private async notePartialUpload(path: string, expected: ItemState | null): Promise<void> {
    // Not with the cycle's signal: pausing or quitting aborted it.
    const look = async () => {
      const item = await this.deps.rclone.stat(this.remoteFs, path, { noMimeType: true }).catch(() => null);
      return item && !item.IsDir ? toItemState(item) : null;
    };
    let partial = await look();
    for (let i = 1; partial && i < PARTIAL_SETTLE_CHECKS; i++) {
      await new Promise((resolve) => setTimeout(resolve, PARTIAL_SETTLE_INTERVAL));
      const again = await look();
      if (sameState(again, partial)) break;
      partial = again;
    }
    if (!partial || sameState(partial, expected)) return;
    const previous = this.baseline?.get(path);
    this.setBaseline(path, {
      isDir: false,
      local: previous && !previous.isDir ? previous.local : CHANGED,
      remote: { size: partial.size, mtime: partial.mtime },
    });
  }

  /** Delete one file. Local files go to the trash when the platform supports it. */
  private async deleteFile(side: Side, path: string): Promise<void> {
    const localFs = this.deps.platform.localFs;
    if (side === 'local' && localFs.trash) {
      await localFs.trash(joinPath(this.record.localPath, path));
      return;
    }
    await this.deps.rclone.deleteFile(this.fs(side), path, { signal: this.signal });
  }

  /** Whether a folder still holds exactly the items listed, unchanged. */
  private async holdsOnly(side: Side, path: string, expected: DeletedItem[]): Promise<boolean> {
    const items = await this.deps.rclone.list(
      this.fs(side),
      path,
      { recurse: true, noMimeType: true },
      { signal: this.signal },
    );
    if (items.length !== expected.length) return false;
    const listed = new Map(items.map((item) => [item.Path, toItemState(item)]));
    return expected.every((e) => sameState(listed.get(e.path) ?? null, e.expected));
  }

  /** Delete an item and everything inside it: a local folder goes to the trash in one piece. */
  private async deleteTree(side: Side, path: string, item: ItemState): Promise<void> {
    const signal = this.signal;
    const localFs = this.deps.platform.localFs;
    if (!item.isDir) return this.deleteFile(side, path);
    if (side === 'local' && localFs.trash) {
      await localFs.trash(joinPath(this.record.localPath, path));
      return;
    }
    await this.deps.rclone.purge(this.fs(side), path, { signal });
  }

  private async sameContents(path: string, info: RemoteFsInfo): Promise<boolean> {
    const signal = this.signal;
    const preferred = ['md5', 'sha1', 'sha256', 'crc32', 'quickxor', 'dropbox'];
    const native = preferred.find((h) => info.hashes.includes(h)) ?? info.hashes[0];
    const hashType = native ?? 'md5';
    const [localHash, remoteHash] = await Promise.all([
      this.deps.rclone.hashFile(this.localFs, path, hashType, { signal }),
      this.deps.rclone.hashFile(this.remoteFs, path, hashType, { signal, download: !native }),
    ]);
    return localHash !== '' && localHash.toLowerCase() === remoteHash.toLowerCase();
  }

  // --- conflicts -----------------------------------------------------------

  /** Current state of both sides of a path. */
  inspect(path: string): Promise<{ local: ItemState | null; remote: ItemState | null }> {
    return this.withLock(async () => {
      const [local, remote] = await Promise.all([this.statSide('local', path), this.statSide('remote', path)]);
      return { local, remote };
    });
  }

  /** Apply the user's decision for a conflicted path. */
  resolveConflict(path: string, choice: ConflictChoice): Promise<ConflictResolution> {
    return this.withLock(async () => {
      await this.loadBaseline();
      const signal = this.signal;
      const [l, r] = await Promise.all([this.statSide('local', path), this.statSide('remote', path)]);
      let result: ConflictResolution;

      const copy = async (from: Side, src: string, dst = src) => {
        await this.deps.rclone.copyFile(this.fs(from), src, this.fs(otherSide(from)), dst, {
          signal,
        });
      };
      const recordFromStat = async (p: string) => {
        const [ls, rs] = await Promise.all([this.statSide('local', p), this.statSide('remote', p)]);
        this.setBaseline(p, ls && rs ? baselineEntry(ls, rs) : null);
      };
      const replace = async (from: Side, src: ItemState, dst: ItemState | null) => {
        const target = otherSide(from);
        if (dst && dst.isDir !== src.isDir) await this.deleteTree(target, path, dst);
        if (src.isDir) await this.deps.rclone.mkdir(this.fs(target), path, { signal });
        else await copy(from, path);
        await recordFromStat(path);
      };

      if (!l && !r) {
        this.setBaseline(path, null);
        result = { outcome: 'gone' };
      } else if (l && !r) {
        await replace('local', l, null);
        result = { outcome: 'local-only' };
      } else if (!l && r) {
        await replace('remote', r, null);
        result = { outcome: 'remote-only' };
      } else if (choice === 'local') {
        await replace('local', l!, r);
        result = { outcome: 'resolved' };
      } else if (choice === 'remote') {
        await replace('remote', r!, l);
        result = { outcome: 'resolved' };
      } else {
        if (l!.isDir || r!.isDir) throw new Error('Only files can be kept side by side.');
        const copyName = await this.conflictCopyName(path);
        await this.deps.rclone.moveFile(this.localFs, path, this.localFs, copyName, { signal });
        await copy('remote', path);
        await copy('local', copyName);
        await Promise.all([recordFromStat(path), recordFromStat(copyName)]);
        result = { outcome: 'resolved', conflictCopy: copyName };
      }

      await this.flushBaseline();
      this.issues.delete(conflictIssueId(path));
      this.needsResync = true;
      this.update({});
      return result;
    });
  }

  private async conflictCopyName(path: string): Promise<string> {
    const dir = parentPath(path);
    const [stem, ext] = splitExtension(baseName(path));
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const host = this.deps.platform.hostName || 'local';
    for (let i = 1; ; i++) {
      const suffix = i === 1 ? '' : ` ${i}`;
      const name = `${stem} (conflicted copy from ${host} ${stamp}${suffix})${ext}`;
      const candidate = joinPath(dir, name);
      const [ls, rs] = await Promise.all([this.statSide('local', candidate), this.statSide('remote', candidate)]);
      if (!ls && !rs) return candidate;
    }
  }

  /**
   * Answer the mass-deletion guard: `delete` lets the deletions through on the
   * next cycle, `restore` copies the items back to the side they vanished from.
   */
  resolveMassDeletion(side: Side, choice: 'delete' | 'restore'): Promise<void> {
    return this.withLock(async () => {
      if (choice === 'delete') {
        this.allowMassDeletion.add(side);
      } else {
        await this.loadBaseline();
        for (const path of this.heldDeletions.get(side) ?? []) this.setBaseline(path, null);
        await this.flushBaseline();
      }
      this.heldDeletions.delete(side);
      this.issues.delete(massDeletionIssueId(side));
      this.needsResync = true;
      this.update({});
    });
  }

  // --- lifecycle -----------------------------------------------------------

  setPaused(paused: boolean): void {
    this.record.paused = paused;
    if (paused) {
      this.abort.abort();
      this.abort = new AbortController();
    }
    // Resuming checks the folder right away (Alto.setFolderPaused), so it shows that until the check reports.
    this.update({ phase: paused ? 'paused' : 'checking', progress: null });
  }

  /** Cancel any running work, resolving once it has stopped. */
  cancel(): Promise<void> {
    this.abort.abort();
    this.abort = new AbortController();
    return this.lock.then(() => {});
  }

  /** Stop syncing for good and forget the sync state. */
  async destroy(): Promise<void> {
    this.destroyed = true;
    this.abort.abort();
    await this.lock.catch(() => {});
    await this.deps.storage.deleteBaseline(this.id);
  }
}
