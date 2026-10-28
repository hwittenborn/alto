import type { Exclusions } from '../exclusions.ts';

import { ancestors, depth, isWithin } from '../paths.ts';
import type {
  Baseline,
  BaselineEntry,
  DeletedItem,
  ItemState,
  Listing,
  PlanAction,
  Side,
  SideSnapshot,
  SyncPlan,
} from './types.ts';

export interface PlanInput {
  local: Listing;
  remote: Listing;
  baseline: Baseline;
  exclusions?: Exclusions;
  /**
   * Maximum difference (ms) between a local and a remote modification time
   * for two same-sized files to be considered identical without hashing.
   * `null` when the remote can't preserve modification times.
   */
  mtimeTolerance: number | null;
  /** Remote treats `A.txt` and `a.txt` as the same file. */
  remoteCaseInsensitive?: boolean;
  /** Restrict planning to these paths (and their descendants). */
  only?: readonly string[];
}

/** Whether an item still matches what was recorded for its side at the last sync. */
export function matchesSnapshot(item: ItemState, wasDir: boolean, snap: SideSnapshot): boolean {
  if (item.isDir !== wasDir) return false;
  if (item.isDir) return true; // Folder timestamps change with their contents; ignore them.
  return item.size === snap.size && item.mtime === snap.mtime;
}

function likelyIdentical(l: ItemState, r: ItemState, tolerance: number | null): boolean {
  return !l.isDir && !r.isDir && l.size === r.size && tolerance !== null && Math.abs(l.mtime - r.mtime) <= tolerance;
}

/**
 * Compute what needs to happen to bring both sides in sync, given their
 * current listings and the baseline recorded at the end of the previous sync.
 *
 * Rules (per path):
 *
 * | local     | remote    | result                                             |
 * |-----------|-----------|----------------------------------------------------|
 * | unchanged | unchanged | nothing                                            |
 * | changed   | unchanged | upload                                             |
 * | unchanged | changed   | download                                           |
 * | changed   | changed   | identical → record, otherwise conflict             |
 * | unchanged | deleted   | delete locally                                     |
 * | changed   | deleted   | upload (an edit beats a deletion)                  |
 * | deleted   | unchanged | delete on remote                                   |
 * | deleted   | changed   | download (an edit beats a deletion)                |
 * | deleted   | deleted   | forget                                             |
 * | new       | missing   | upload / missing, new → download                   |
 * | new       | new       | identical → record, otherwise conflict             |
 *
 * Folders are only deleted when everything inside them is being deleted too;
 * otherwise they're kept (and recreated on the other side). Such a folder is
 * one action, deleted in one step with everything in it.
 */
export function planSync(input: PlanInput): SyncPlan {
  const { local, remote, baseline, exclusions, mtimeTolerance } = input;
  const actions: PlanAction[] = [];

  const inScope = (path: string) => !input.only || input.only.some((p) => isWithin(path, p) || isWithin(p, path));

  // Excluded paths are neither synced nor deleted. Their baseline is dropped so
  // that removing the exclusion later treats them as new on both sides.
  const isExcluded = (path: string, isDir: boolean) => (exclusions ? exclusions.isExcluded(path, isDir) : false);

  const paths = new Set<string>();
  for (const map of [local, remote, baseline] as const) {
    for (const path of map.keys()) {
      if (inScope(path)) paths.add(path);
    }
  }

  // Paths whose subtree must not be touched (type mismatches, case collisions).
  const blocked = new Set<string>();
  const isBlocked = (path: string) => blocked.has(path) || ancestors(path).some((a) => blocked.has(a));

  if (input.remoteCaseInsensitive) {
    const seen = new Map<string, string>();
    for (const path of local.keys()) {
      if (!inScope(path)) continue;
      const key = path.toLowerCase();
      const other = seen.get(key);
      if (other !== undefined && other !== path) {
        for (const p of [other, path]) {
          blocked.add(p);
          actions.push({
            type: 'error',
            path: p,
            message: `'${other}' and '${path}' only differ in letter case, which the server can't tell apart.`,
          });
        }
      } else {
        seen.set(key, path);
      }
    }
  }

  /**
   * One side swapped a file for a folder (or vice versa) and the other side
   * still has the old, untouched item: propagate the swap. Returns null when
   * both sides changed (a real conflict) or the old folder holds anything
   * that isn't safe to delete.
   */
  const planReplacement = (path: string, l: ItemState, r: ItemState, b: BaselineEntry): PlanAction[] | null => {
    const localUnchanged = matchesSnapshot(l, b.isDir, b.local);
    const remoteUnchanged = matchesSnapshot(r, b.isDir, b.remote);
    if (localUnchanged === remoteUnchanged) return null;
    const side: Side = localUnchanged ? 'local' : 'remote';
    const expected = localUnchanged ? l : r;
    const source = localUnchanged ? r : l;

    if (source.isDir) return [{ type: 'replace', side, path, expected, source }];

    // Folder replaced by a file elsewhere: everything inside the old folder
    // must be unchanged since the last sync (and not excluded) to delete it.
    const listing = side === 'local' ? local : remote;
    const deletes: PlanAction[] = [];
    for (const [p, item] of listing) {
      if (!isWithin(p, path) || p === path) continue;
      const pb = baseline.get(p);
      const snap = pb ? (side === 'local' ? pb.local : pb.remote) : null;
      if (!pb || !snap || !matchesSnapshot(item, pb.isDir, snap) || isExcluded(p, item.isDir)) {
        return null;
      }
      deletes.push({ type: 'delete', side, path: p, expected: item });
    }
    deletes.sort((x, y) => depth((y as { path: string }).path) - depth((x as { path: string }).path));
    return [...deletes, { type: 'replace', side, path, expected, source }];
  };

  // Process parents before children so blocked subtrees are known in time.
  const sorted = [...paths].sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : 1));

  const deleteDirs: Array<{ side: Side; path: string; expected: ItemState; baseline: BaselineEntry }> = [];

  for (const path of sorted) {
    const l = local.get(path) ?? null;
    const r = remote.get(path) ?? null;
    const b = baseline.get(path) ?? null;

    if (isBlocked(path)) continue;

    const excluded =
      (l !== null && isExcluded(path, l.isDir)) ||
      (r !== null && isExcluded(path, r.isDir)) ||
      (l === null && r === null && b !== null && isExcluded(path, b.isDir));
    if (excluded) {
      if (b) actions.push({ type: 'forget', path });
      continue;
    }

    if (l && r) {
      if (l.isDir !== r.isDir) {
        const replacement = b ? planReplacement(path, l, r, b) : null;
        if (replacement) {
          actions.push(...replacement);
          // Folder → file: the folder's contents are deleted by the replacement
          // itself. File → folder: the new folder's contents are planned below.
          const last = replacement[replacement.length - 1] as Extract<PlanAction, { type: 'replace' }>;
          if (!last.source.isDir) blocked.add(path);
          continue;
        }
        blocked.add(path);
        actions.push({ type: 'conflict', path, reason: 'type-mismatch', local: l, remote: r });
        continue;
      }

      if (l.isDir) {
        if (!b || !b.isDir) actions.push({ type: 'record', path, local: l, remote: r });
        continue;
      }

      if (b && !b.isDir) {
        const localChanged = !matchesSnapshot(l, b.isDir, b.local);
        const remoteChanged = !matchesSnapshot(r, b.isDir, b.remote);
        if (!localChanged && !remoteChanged) continue;
        if (localChanged && !remoteChanged) {
          actions.push({ type: 'copy', from: 'local', path, source: l, expectedTarget: r });
        } else if (!localChanged && remoteChanged) {
          actions.push({ type: 'copy', from: 'remote', path, source: r, expectedTarget: l });
        } else if (l.size === r.size) {
          actions.push({ type: 'verify', path, local: l, remote: r, reason: 'both-modified' });
        } else {
          actions.push({ type: 'conflict', path, reason: 'both-modified', local: l, remote: r });
        }
        continue;
      }

      // Never synced (or the baseline was a folder): both sides appeared independently.
      if (likelyIdentical(l, r, mtimeTolerance)) {
        actions.push({ type: 'record', path, local: l, remote: r });
      } else if (l.size === r.size) {
        actions.push({ type: 'verify', path, local: l, remote: r, reason: 'both-created' });
      } else {
        actions.push({ type: 'conflict', path, reason: 'both-created', local: l, remote: r });
      }
      continue;
    }

    if (l || r) {
      const side: Side = l ? 'local' : 'remote';
      const item = (l ?? r)!;
      const snap = b ? (side === 'local' ? b.local : b.remote) : null;
      const unchanged = b !== null && snap !== null && matchesSnapshot(item, b.isDir, snap);

      if (unchanged) {
        // Deleted on the other side and untouched here: propagate the deletion.
        if (item.isDir) {
          deleteDirs.push({ side, path, expected: item, baseline: b! });
        } else {
          actions.push({ type: 'delete', side, path, expected: item });
        }
      } else if (item.isDir) {
        actions.push({ type: 'mkdir', side: side === 'local' ? 'remote' : 'local', path });
      } else {
        actions.push({ type: 'copy', from: side, path, source: item, expectedTarget: null });
      }
      continue;
    }

    // Gone on both sides.
    if (b) actions.push({ type: 'forget', path });
  }

  // A folder can only be deleted when everything inside it (on that side) is
  // being deleted as well. Excluded or edited content keeps the folder alive,
  // in which case it is recreated on the other side instead.
  const deletedPaths = new Map<Side, Set<string>>([
    ['local', new Set()],
    ['remote', new Set()],
  ]);
  for (const action of actions) {
    if (action.type === 'delete') deletedPaths.get(action.side)!.add(action.path);
  }
  for (const d of deleteDirs) deletedPaths.get(d.side)!.add(d.path);

  // Deepest first, so a kept child folder keeps its parents too.
  deleteDirs.sort((a, b) => depth(b.path) - depth(a.path));
  for (const d of deleteDirs) {
    const listing = d.side === 'local' ? local : remote;
    const deleted = deletedPaths.get(d.side)!;
    let keep = false;
    for (const path of listing.keys()) {
      if (path !== d.path && isWithin(path, d.path) && !deleted.has(path)) {
        keep = true;
        break;
      }
    }
    if (keep) {
      deleted.delete(d.path);
      actions.push({ type: 'mkdir', side: d.side === 'local' ? 'remote' : 'local', path: d.path });
    } else {
      actions.push({ type: 'delete', side: d.side, path: d.path, expected: d.expected });
    }
  }

  const planned = foldDeletedFolders(actions);
  const summary = { uploads: 0, downloads: 0, localDeletes: 0, remoteDeletes: 0, conflicts: 0 };
  for (const a of planned) {
    if (a.type === 'copy') {
      if (a.from === 'local') summary.uploads++;
      else summary.downloads++;
    } else if (a.type === 'mkdir') {
      if (a.side === 'remote') summary.uploads++;
      else summary.downloads++;
    } else if (a.type === 'delete') {
      const items = 1 + (a.contents?.length ?? 0);
      if (a.side === 'local') summary.localDeletes += items;
      else summary.remoteDeletes += items;
    } else if (a.type === 'replace') {
      if (a.side === 'remote') summary.uploads++;
      else summary.downloads++;
    } else if (a.type === 'conflict') {
      summary.conflicts++;
    }
  }

  return { actions: planned, summary };
}

/**
 * A folder deleted with everything in it goes in one step, to the trash in one
 * piece or in one purge on the server: the deletions inside it become its
 * `contents`.
 */
function foldDeletedFolders(actions: PlanAction[]): PlanAction[] {
  type Delete = Extract<PlanAction, { type: 'delete' }>;
  const key = (side: Side, path: string) => `${side}:${path}`;
  const folders = new Map<string, Delete>();
  for (const a of actions) if (a.type === 'delete' && a.expected.isDir) folders.set(key(a.side, a.path), a);
  // The outermost folder deleted on the same side above this one, if any.
  const outermost = (a: Delete): Delete | undefined => {
    let found: Delete | undefined;
    for (const p of ancestors(a.path)) found = folders.get(key(a.side, p)) ?? found;
    return found;
  };

  const contents = new Map<Delete, DeletedItem[]>();
  const kept: PlanAction[] = [];
  for (const a of actions) {
    const folder = a.type === 'delete' ? outermost(a) : undefined;
    if (!folder || a.type !== 'delete') {
      kept.push(a);
      continue;
    }
    let items = contents.get(folder);
    if (!items) contents.set(folder, (items = []));
    items.push({ path: a.path, expected: a.expected });
  }
  return kept.map((a) => (a.type === 'delete' && a.expected.isDir ? { ...a, contents: contents.get(a) ?? [] } : a));
}

/** Count baseline entries that are files (used by the mass-deletion guard). */
export function countBaselineFiles(baseline: Baseline): number {
  let n = 0;
  for (const entry of baseline.values()) if (!entry.isDir) n++;
  return n;
}
