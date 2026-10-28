import { describe, expect, it } from 'vitest';
import { overallStatus } from '../src/describe.ts';
import type { FolderView } from '../src/state.ts';
import type { FolderRuntime } from '../src/sync/folder.ts';

let ids = 0;
function folder(runtime: Partial<FolderRuntime>, record: Partial<FolderView> = {}): FolderView {
  const id = `f${++ids}`;
  return {
    id,
    remote: 'nas',
    localPath: `/home/me/${id}`,
    remotePath: id,
    addedAt: 1,
    ...record,
    runtime: { phase: 'idle', message: null, lastCheckedAt: 1000, progress: null, issues: [], ...runtime },
  };
}

describe('overallStatus', () => {
  it('is synced as of the oldest of the last checks', () => {
    expect(overallStatus([folder({ lastCheckedAt: 5000 }), folder({ lastCheckedAt: 3000 })])).toEqual({
      kind: 'done',
      issues: 0,
      message: 'All files are synced.',
      lastCheckedAt: 3000,
    });
  });

  it('awaits folders that were never checked', () => {
    const status = overallStatus([folder({}), folder({ lastCheckedAt: null })]);
    expect(status).toMatchObject({ kind: 'loading', lastCheckedAt: null });
  });

  it('names the folder being synced, or counts them', () => {
    const docs = folder({ phase: 'syncing' }, { localPath: '/home/me/Documents' });
    expect(overallStatus([docs, folder({})]).message).toBe("Syncing 'Documents'…");
    expect(overallStatus([docs, folder({ phase: 'checking' })]).message).toBe('Syncing 2 folders…');
  });

  it('is paused when every folder is, and leaves paused folders out otherwise', () => {
    expect(overallStatus([folder({ phase: 'paused' })])).toMatchObject({ kind: 'paused', lastCheckedAt: null });
    expect(overallStatus([folder({ phase: 'paused', lastCheckedAt: 1 }), folder({ lastCheckedAt: 9 })])).toMatchObject({
      kind: 'done',
      lastCheckedAt: 9,
    });
    // Resuming checks the folder right away: the tray shows it syncing, not paused or synced.
    expect(overallStatus([folder({ phase: 'checking', lastCheckedAt: 1 })]).kind).toBe('syncing');
  });

  it('is offline when any folder can’t reach its server', () => {
    const offline = folder({ phase: 'offline' }, { remote: 'cloud' });
    expect(overallStatus([offline, folder({})]).message).toBe("Unable to connect to 'cloud'.");
  });

  it('puts what needs the user before being offline', () => {
    const status = overallStatus([folder({ phase: 'offline' }), folder({ phase: 'error', message: 'Gone' })]);
    expect(status).toMatchObject({ kind: 'warning', issues: 1, message: '1 item needs your attention.' });
  });
});
