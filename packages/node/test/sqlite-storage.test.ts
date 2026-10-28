import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AltoConfig, BaselineEntry } from '@alto/core';
import { describe, expect, it } from 'vitest';
import { SqliteStorage } from '../src/sqlite-storage.ts';

const dbFile = () => path.join(mkdtempSync(path.join(tmpdir(), 'alto-')), 'nested', 'alto.db');

const config: AltoConfig = {
  remotes: [{ name: 'nas', provider: 'webdav', addedAt: 1 }],
  folders: [
    { id: 'docs', remote: 'nas', localPath: '/home/me/Documents', remotePath: 'Documents', addedAt: 2 },
    { id: 'pics', remote: 'nas', localPath: '/home/me/Pictures', remotePath: 'Pictures', addedAt: 3, paused: true },
  ],
};

const entry = (size: number): BaselineEntry => ({
  isDir: false,
  local: { size, mtime: 1000 },
  remote: { size, mtime: 2000 },
});

describe('SqliteStorage', () => {
  it('starts out empty', async () => {
    const storage = new SqliteStorage(dbFile());
    expect(await storage.loadConfig()).toEqual({ remotes: [], folders: [] });
    await storage.close();
  });

  it('keeps the config across restarts', async () => {
    const file = dbFile();
    const storage = new SqliteStorage(file);
    await storage.saveConfig(config);
    await storage.close();

    const reopened = new SqliteStorage(file);
    expect(await reopened.loadConfig()).toEqual(config);
    await reopened.close();
  });

  it('replaces the config, updating and removing rows', async () => {
    const storage = new SqliteStorage(dbFile());
    await storage.saveConfig(config);
    const next: AltoConfig = {
      remotes: [{ name: 'drive', provider: 'gdrive', addedAt: 4 }],
      folders: [{ id: 'music', remote: 'drive', localPath: '/home/me/Music', remotePath: '', addedAt: 5 }],
    };
    await storage.saveConfig(next);
    expect(await storage.loadConfig()).toEqual(next);
    await storage.saveConfig({ remotes: [], folders: [] });
    expect(await storage.loadConfig()).toEqual({ remotes: [], folders: [] });
    await storage.close();
  });

  it('a provider Alto no longer offers becomes a plain rclone remote', async () => {
    const storage = new SqliteStorage(dbFile());
    await storage.saveConfig({ remotes: [{ name: 'Home', provider: 'sftp' as never, addedAt: 1 }], folders: [] });
    expect((await storage.loadConfig()).remotes[0]!.provider).toBeNull();
    await storage.close();
  });

  it('refuses a folder pair whose remote isn’t in the config', async () => {
    const storage = new SqliteStorage(dbFile());
    await storage.saveConfig(config);
    await expect(storage.saveConfig({ remotes: [], folders: config.folders })).rejects.toThrow(/FOREIGN KEY/);
    expect(await storage.loadConfig()).toEqual(config);
    await storage.close();
  });

  it('applies baseline changes larger than one statement', async () => {
    const storage = new SqliteStorage(dbFile());
    await storage.saveConfig(config);
    const upserts = new Map<string, BaselineEntry>(Array.from({ length: 1234 }, (_, i) => [`file-${i}`, entry(i)]));
    upserts.set('dir', { ...entry(0), isDir: true });
    await storage.updateBaseline('docs', { upserts, deletes: new Set() });
    expect(await storage.loadBaseline('docs')).toEqual(upserts);

    const deletes = new Set(Array.from({ length: 1000 }, (_, i) => `file-${i}`));
    await storage.updateBaseline('docs', { upserts: new Map([['file-1233', entry(7)]]), deletes });
    const baseline = await storage.loadBaseline('docs');
    expect(baseline.size).toBe(235);
    expect(baseline.get('file-1233')).toEqual(entry(7));
    expect(baseline.get('dir')!.isDir).toBe(true);
    expect(await storage.loadBaseline('pics')).toEqual(new Map());
    await storage.close();
  });

  it('forgets a folder pair’s baseline with it', async () => {
    const storage = new SqliteStorage(dbFile());
    await storage.saveConfig(config);
    const upserts = new Map([['a', entry(1)]]);
    await storage.updateBaseline('docs', { upserts, deletes: new Set() });
    await storage.updateBaseline('pics', { upserts, deletes: new Set() });

    await storage.deleteBaseline('docs');
    expect(await storage.loadBaseline('docs')).toEqual(new Map());
    await storage.saveConfig({ ...config, folders: [config.folders[0]!] });
    expect(await storage.loadBaseline('pics')).toEqual(new Map());
    await storage.close();
  });

  it('refuses a database migrated by a newer Alto and leaves it as it is', async () => {
    const file = dbFile();
    const storage = new SqliteStorage(file);
    await storage.saveConfig(config);
    await storage.close();
    const raw = new DatabaseSync(file);
    raw.prepare("INSERT INTO kysely_migration (name, timestamp) VALUES ('9999-future', '')").run();
    raw.close();

    const newer = new SqliteStorage(file);
    await expect(newer.loadConfig()).rejects.toThrow(/can't open its database/);
    await expect(newer.saveConfig({ remotes: [], folders: [] })).rejects.toThrow(/can't open its database/);
    await newer.close();
    const rows = new DatabaseSync(file).prepare('SELECT id FROM folders').all();
    expect(rows).toHaveLength(2);
  });
});
