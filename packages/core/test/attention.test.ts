import { describe, expect, it } from 'vitest';
import { AttentionTracker } from '../src/attention.ts';
import { type AltoState, type FolderView, initialState } from '../src/state.ts';
import type { SyncIssue } from '../src/sync/issues.ts';

const conflict = (path: string): SyncIssue => ({
  id: `conflict:${path}`,
  kind: 'conflict',
  path,
  reason: 'both-modified',
  local: null,
  remote: null,
  detectedAt: 1,
});

function stateWith(issues: SyncIssue[]): AltoState {
  const folder: FolderView = {
    id: 'docs',
    remote: 'nas',
    localPath: '/home/me/Documents',
    remotePath: 'Documents',
    addedAt: 1,
    runtime: { phase: 'idle', message: null, lastCheckedAt: null, progress: null, issues },
  };
  return { ...initialState('/home/me', 'laptop'), folders: [folder] };
}

describe('AttentionTracker', () => {
  it('tells about the issues a first sync finds, however soon after startup', () => {
    const notices = new AttentionTracker().update(stateWith([conflict('a.txt')]));
    expect(notices).toEqual([
      {
        folderId: 'docs',
        title: 'Sync conflict in ~/Documents',
        body: "'a.txt' was changed both here and on the server.",
      },
    ]);
  });

  it('tells about everything one cycle finds in one notice per folder', () => {
    const notices = new AttentionTracker().update(
      stateWith([
        conflict('a.txt'),
        conflict('b.txt'),
        { id: 'mass-deletion:remote', kind: 'mass-deletion', side: 'remote', count: 40, total: 50, detectedAt: 1 },
        { id: 'error:c.txt:denied', kind: 'error', path: 'c.txt', message: 'denied', detectedAt: 1 },
      ]),
    );
    expect(notices).toEqual([
      {
        folderId: 'docs',
        title: 'Sync conflicts in ~/Documents',
        body:
          '2 files were changed both here and on the server.\n' +
          '40 files were deleted in ~/Documents. Confirm before they are also deleted on the server.',
      },
    ]);
  });

  it('tells about an issue once, and again if it comes back after going away', () => {
    const tracker = new AttentionTracker();
    expect(tracker.update(stateWith([conflict('a.txt')]))).toHaveLength(1);
    expect(tracker.update(stateWith([conflict('a.txt')]))).toEqual([]);
    expect(tracker.update(stateWith([]))).toEqual([]);
    expect(tracker.update(stateWith([conflict('a.txt')]))).toHaveLength(1);
  });

  it('says where held deletions would happen', () => {
    const [notice] = new AttentionTracker().update(
      stateWith([
        { id: 'mass-deletion:local', kind: 'mass-deletion', side: 'local', count: 9, total: 10, detectedAt: 1 },
      ]),
    );
    expect(notice).toMatchObject({
      title: 'Confirm deletions',
      body: '9 files were deleted on the server. Confirm before they are also deleted in ~/Documents.',
    });
  });
});
