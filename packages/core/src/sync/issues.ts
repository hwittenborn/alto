import type { ConflictReason, ItemState, Side } from './types.ts';

/** Something about a sync folder that needs the user's attention. */
export type SyncIssue =
  | {
      id: string;
      kind: 'conflict';
      path: string;
      reason: ConflictReason;
      local: ItemState | null;
      remote: ItemState | null;
      detectedAt: number;
    }
  | { id: string; kind: 'error'; path: string; message: string; detectedAt: number }
  | {
      id: string;
      kind: 'mass-deletion';
      /** Side the deletions would happen on. */
      side: Side;
      count: number;
      total: number;
      detectedAt: number;
    };

export function conflictIssueId(path: string): string {
  return `conflict:${path}`;
}

export function errorIssueId(path: string, message: string): string {
  return `error:${path}:${message}`;
}

export function massDeletionIssueId(side: Side): string {
  return `mass-deletion:${side}`;
}
