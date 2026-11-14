import { expect, it, vi } from 'vitest';
import { NodeLocalFs } from '../../node/src/index.ts';
import { MemoryStorage, RcloneClient, SyncEngine } from '../src/index.ts';

it('cancels work on sleep and waits before checking again after the latest wake', async () => {
  vi.useFakeTimers();
  const engine = new SyncEngine({
    rclone: new RcloneClient({ url: 'http://127.0.0.1:1/' }),
    storage: new MemoryStorage(),
    platform: {
      localFs: new NodeLocalFs({ watch: false }),
      hostName: 'test',
      openAuthUrl: () => {},
    },
  });
  const folder = engine.add({
    id: 'folder',
    remote: 'remote',
    remotePath: '',
    localPath: '/unused',
    addedAt: 0,
    paused: false,
  });
  const sync = vi.spyOn(folder, 'sync').mockResolvedValue(undefined);
  const cancel = vi.spyOn(folder, 'cancel');
  try {
    engine.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(1);

    engine.suspend();
    engine.resume();
    await vi.advanceTimersByTimeAsync(9_000);
    engine.suspend();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(sync).toHaveBeenCalledTimes(1);

    engine.resume();
    await vi.advanceTimersByTimeAsync(10_001);
    expect(sync).toHaveBeenCalledTimes(2);
  } finally {
    await engine.stop();
    vi.useRealTimers();
  }
});
