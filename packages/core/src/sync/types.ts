/** Which end of a sync pair an item lives on. */
export type Side = 'local' | 'remote';

export const otherSide = (side: Side): Side => (side === 'local' ? 'remote' : 'local');

/** The observed state of an item on one side. */
export interface ItemState {
  isDir: boolean;
  /** Size in bytes, -1 for directories. */
  size: number;
  /** Modification time in ms since the epoch. */
  mtime: number;
}

/** What one side looked like when the item was last synced. */
export interface SideSnapshot {
  size: number;
  mtime: number;
}

/**
 * The state of an item when it was last successfully synced. Each side is
 * recorded separately, so change detection never compares clocks or
 * timestamp precision across machines: a side has changed when it no longer
 * matches *its own* snapshot. This is what makes multiple clients syncing the
 * same remote folder safe.
 */
export interface BaselineEntry {
  isDir: boolean;
  local: SideSnapshot;
  remote: SideSnapshot;
}

export type Baseline = Map<string, BaselineEntry>;

/** Listing of one side, keyed by path relative to the sync folder root. */
export type Listing = Map<string, ItemState>;

/** An item inside a folder that is deleted as a whole, as it was listed. */
export interface DeletedItem {
  path: string;
  expected: ItemState;
}

export type ConflictReason =
  /** Both sides changed the file since the last sync, to different contents. */
  | 'both-modified'
  /** The file appeared on both sides (no previous sync) with different contents. */
  | 'both-created'
  /** One side has a file where the other has a folder. */
  | 'type-mismatch';

export type PlanAction =
  /** Create a directory on `side`. */
  | { type: 'mkdir'; side: Side; path: string }
  /**
   * Copy a file from `from` to the other side. `expectedTarget` is what the
   * target looked like when planning (`null` = absent); the executor checks it
   * again right before overwriting so concurrent edits are never clobbered.
   */
  | {
      type: 'copy';
      from: Side;
      path: string;
      source: ItemState;
      expectedTarget: ItemState | null;
    }
  /**
   * The other side replaced a file with a folder (or a folder with a file)
   * while `side` kept the old, unchanged item: swap it for the new type.
   * `source` is the new item on the other side.
   */
  | { type: 'replace'; side: Side; path: string; expected: ItemState; source: ItemState }
  /**
   * Delete an item on `side` that was deleted on the other side. A folder
   * deleted with everything in it is one action: `contents` is what was inside
   * it, all deleted with it.
   */
  | { type: 'delete'; side: Side; path: string; expected: ItemState; contents?: DeletedItem[] }
  /** Both sides already agree: record them as the new baseline. */
  | { type: 'record'; path: string; local: ItemState; remote: ItemState }
  /** Drop the baseline entry (item gone everywhere, or now excluded). */
  | { type: 'forget'; path: string }
  /** Sizes match but timestamps can't prove equality: compare hashes. */
  | {
      type: 'verify';
      path: string;
      local: ItemState;
      remote: ItemState;
      reason: 'both-modified' | 'both-created';
    }
  /** The user has to decide. */
  | {
      type: 'conflict';
      path: string;
      reason: ConflictReason;
      local: ItemState | null;
      remote: ItemState | null;
    }
  /** Something about this path can't be synced (reported to the user). */
  | { type: 'error'; path: string; message: string };

export interface PlanSummary {
  uploads: number;
  downloads: number;
  localDeletes: number;
  remoteDeletes: number;
  conflicts: number;
}

export interface SyncPlan {
  actions: PlanAction[];
  summary: PlanSummary;
}
