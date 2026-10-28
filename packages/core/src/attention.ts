import { formatLocalPath } from './paths.ts';
import type { AltoState } from './state.ts';

/** A desktop notification about a folder that needs the user. */
export interface AttentionNotice {
  folderId: string;
  title: string;
  body: string;
}

/**
 * Tells the user about conflicts and held deletions when they're found: one
 * notice per folder for everything a sync cycle finds. Errors are shown in the
 * app and not worth interrupting for. An issue that goes away (resolved, say)
 * is notified again if it comes back.
 */
export class AttentionTracker {
  private notified = new Set<string>();

  /** Notices for the issues in `state` that weren't there last time. */
  update(state: AltoState): AttentionNotice[] {
    const current = new Set<string>();
    const notices: AttentionNotice[] = [];
    for (const folder of state.folders) {
      const found = folder.runtime.issues.filter((issue) => {
        const key = `${folder.id}:${issue.id}`;
        current.add(key);
        return !this.notified.has(key);
      });
      const where = formatLocalPath(folder.localPath, state.homeDir);
      const conflicts = found.flatMap((issue) => (issue.kind === 'conflict' ? [issue.path] : []));
      const lines = found.flatMap((issue) =>
        issue.kind !== 'mass-deletion'
          ? []
          : issue.side === 'local'
            ? [`${issue.count} files were deleted on the server. Confirm before they are also deleted in ${where}.`]
            : [`${issue.count} files were deleted in ${where}. Confirm before they are also deleted on the server.`],
      );
      if (conflicts.length === 1) {
        lines.unshift(`'${conflicts[0]}' was changed both here and on the server.`);
      } else if (conflicts.length > 1) {
        lines.unshift(`${conflicts.length} files were changed both here and on the server.`);
      }
      if (lines.length === 0) continue;
      notices.push({
        folderId: folder.id,
        title:
          conflicts.length === 0
            ? 'Confirm deletions'
            : conflicts.length === 1
              ? `Sync conflict in ${where}`
              : `Sync conflicts in ${where}`,
        body: lines.join('\n'),
      });
    }
    this.notified = current;
    return notices;
  }
}
