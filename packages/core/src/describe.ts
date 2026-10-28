/**
 * Presentation helpers shared by every Alto UI (desktop today, mobile later):
 * turn engine state into human readable text.
 */

import { baseName, formatLocalPath, formatRemotePath } from './paths.ts';
import type { FolderView, OverallStatus } from './state.ts';
import type { FolderProgress, TransferOp } from './sync/folder.ts';
import type { SyncIssue } from './sync/issues.ts';
import type { ConflictReason } from './sync/types.ts';

export type StatusIcon = 'awaiting' | 'syncing' | 'synced' | 'warning' | 'offline' | 'error' | 'paused';

/** Icon to show next to a folder. */
export function folderStatusIcon(folder: FolderView): StatusIcon {
  const { phase, issues, lastCheckedAt } = folder.runtime;
  switch (phase) {
    case 'checking':
    case 'syncing':
      return 'syncing';
    case 'offline':
      return 'offline';
    case 'error':
      return 'error';
    case 'paused':
      return 'paused';
    default:
      if (issues.length > 0) return 'warning';
      return lastCheckedAt === null ? 'awaiting' : 'synced';
  }
}

/** What each kind of transfer is doing: to one item, or to `count` of them. */
const opLabel: Record<TransferOp, (name: string | number) => string> = {
  upload: (n) => (typeof n === 'string' ? `Uploading '${n}'…` : `Uploading ${n} files…`),
  download: (n) => (typeof n === 'string' ? `Downloading '${n}'…` : `Downloading ${n} files…`),
  'delete-local': (n) => (typeof n === 'string' ? `Removing '${n}'…` : `Removing ${n} items…`),
  'delete-remote': (n) =>
    typeof n === 'string' ? `Removing '${n}' from the server…` : `Removing ${n} items from the server…`,
  'mkdir-local': (n) => (typeof n === 'string' ? `Creating '${n}'…` : `Creating ${n} folders…`),
  'mkdir-remote': (n) =>
    typeof n === 'string' ? `Creating '${n}' on the server…` : `Creating ${n} folders on the server…`,
  verify: (n) => (typeof n === 'string' ? `Comparing '${n}'…` : `Comparing ${n} files…`),
};

/** One-line status for a folder ("Files are synced.", "Downloading 'a.txt'…"). */
export function folderStatusText(folder: FolderView): string {
  const { phase, message, progress, issues } = folder.runtime;
  switch (phase) {
    case 'checking':
      return 'Checking for changes…';
    case 'syncing': {
      const current = progress?.current ?? [];
      if (current.length === 0) return 'Syncing…';
      const ops = new Set(current.map((c) => c.op));
      if (current.length === 1) return opLabel[current[0]!.op](baseName(current[0]!.path));
      return ops.size === 1 ? opLabel[current[0]!.op](current.length) : `Syncing ${current.length} items…`;
    }
    case 'offline':
      return 'Unable to connect to the server. Retrying…';
    case 'error':
      return message ?? 'An error occurred.';
    case 'paused':
      return 'Syncing is paused.';
    default:
      if (issues.length > 0) return attentionText(issues.length);
      return folder.runtime.lastCheckedAt === null ? 'Awaiting sync check…' : 'Files are synced.';
  }
}

/** "15.7 MB of 65.0 MB · 3.8 MB/s", when the sizes of what's transferred are known. */
export function progressBytesText(progress: FolderProgress): string | null {
  if (progress.bytesTotal <= 0) return null;
  const text = `${formatBytes(progress.bytesDone)} of ${formatBytes(progress.bytesTotal)}`;
  return progress.speed > 0 ? `${text} · ${formatBytes(progress.speed)}/s` : text;
}

/** "4 of 6 items" done. */
export function progressCountText(progress: FolderProgress): string {
  return `${progress.done} of ${progress.total} ${progress.total === 1 ? 'item' : 'items'}`;
}

/** How far along a sync is (0–1): by bytes when the sizes are known, so one large file fills it as it goes. */
export function progressFraction(progress: FolderProgress): number {
  if (progress.total <= 0) return 0;
  return Math.min(
    1,
    progress.bytesTotal > 0 ? progress.bytesDone / progress.bytesTotal : progress.done / progress.total,
  );
}

/** A folder's name: its local folder's. */
function folderName(folder: FolderView): string {
  return baseName(folder.localPath) || folder.localPath;
}

/**
 * Alto's status across all folders, for the tray. The first of these that
 * applies:
 *
 * 1. `syncing`: a folder is being checked or synced.
 * 2. `paused`: every folder is paused.
 * 3. `warning`: something needs the user (an issue), or a folder can't sync.
 * 4. `offline`: a folder can't reach its server.
 * 5. `loading`: a folder hasn't been checked yet.
 * 6. `done`: everything was in sync at the last checks.
 *
 * Paused folders only count for 2.
 */
export function overallStatus(folders: FolderView[]): OverallStatus {
  const active = folders.filter((f) => f.runtime.phase !== 'paused');
  const checks = active.map((f) => f.runtime.lastCheckedAt);
  const lastCheckedAt = checks.length > 0 && checks.every((t) => t !== null) ? Math.min(...(checks as number[])) : null;
  const issues = folders.reduce((n, f) => n + f.runtime.issues.length, 0);
  const status = (kind: OverallStatus['kind'], message: string, count = issues): OverallStatus => ({
    kind,
    issues: count,
    message,
    lastCheckedAt,
  });

  if (folders.length === 0) return status('done', 'No folders are being synced.');
  const busy = folders.filter((f) => f.runtime.phase === 'checking' || f.runtime.phase === 'syncing');
  if (busy.length === 1) return status('syncing', `Syncing '${folderName(busy[0]!)}'…`);
  if (busy.length > 1) return status('syncing', `Syncing ${busy.length} folders…`);
  if (active.length === 0) return status('paused', 'Syncing is paused.');
  const problems = issues + folders.filter((f) => f.runtime.phase === 'error').length;
  if (problems > 0) return status('warning', attentionText(problems), problems);
  const offline = [...new Set(active.filter((f) => f.runtime.phase === 'offline').map((f) => f.remote))];
  if (offline.length === 1) return status('offline', `Unable to connect to '${offline[0]}'.`);
  if (offline.length > 1) return status('offline', `Unable to connect to ${offline.length} servers.`);
  if (lastCheckedAt === null) return status('loading', 'Awaiting sync checks…');
  return status('done', 'All files are synced.');
}

/** "just now", "2 minutes ago". */
export function timeAgo(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((now - timestamp) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (seconds < 45) return rtf.format(0, 'second').replace(/^now$/, 'just now');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(hours / 24), 'day');
}

/** "Last checked 2 minutes ago". */
export function lastCheckedText(timestamp: number, now = Date.now()): string {
  return `Last checked ${timeAgo(timestamp, now)}`;
}

/** Why the item called `name` is in conflict. */
export function conflictText(reason: ConflictReason, name: string): string {
  switch (reason) {
    case 'type-mismatch':
      return `'${name}' is a file on one side and a folder on the other.`;
    case 'both-created':
      return `Different items named '${name}' were added here and on the server.`;
    default:
      return `'${name}' was changed both here and on the server since the last sync.`;
  }
}

/** "1 item needs your attention." */
export function attentionText(count: number): string {
  return count === 1 ? '1 item needs your attention.' : `${count} items need your attention.`;
}

/** "~/Documents → /Documents". */
export function folderTitle(folder: FolderView, homeDir: string): { local: string; remote: string } {
  return { local: formatLocalPath(folder.localPath, homeDir), remote: formatRemotePath(folder.remotePath) };
}

/** Title + subtitle for an issue row. */
export function describeIssue(
  issue: SyncIssue,
  folder: FolderView,
  homeDir: string,
): {
  title: string;
  subtitle: string;
} {
  switch (issue.kind) {
    case 'conflict':
      return { title: issue.path, subtitle: conflictText(issue.reason, baseName(issue.path)) };
    case 'error':
      return { title: issue.path || formatLocalPath(folder.localPath, homeDir), subtitle: issue.message };
    case 'mass-deletion':
      return {
        title:
          issue.side === 'local'
            ? `${issue.count} files were deleted on the server`
            : `${issue.count} files were deleted on this computer`,
        subtitle:
          issue.side === 'local'
            ? 'Confirm before they are also deleted on this computer.'
            : 'Confirm before they are also deleted on the server.',
      };
  }
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Human readable byte size (decimal units, like GNOME). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}
