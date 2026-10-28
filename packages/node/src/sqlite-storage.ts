import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Kysely, SqliteDialect, sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { type AltoConfig, type AltoStorage, type Baseline, type BaselineChanges, isProviderId } from '@alto/core';
import { migrationProvider } from './sqlite/migrations/index.ts';
import { nodeSqliteDatabase } from './sqlite/node-sqlite.ts';
import type { Database } from './sqlite/schema.ts';

/** Rows per statement when writing a baseline, well under SQLite's bound parameter limit. */
const CHUNK = 500;

/**
 * `AltoStorage` backed by SQLite, through Kysely over Node's built-in
 * `node:sqlite`. The database is opened and migrated on first use, so a
 * database Alto can't migrate is reported by `loadConfig()` like any other
 * storage error. Baselines are updated incrementally inside transactions,
 * so very large folders stay cheap.
 */
export class SqliteStorage implements AltoStorage {
  private readonly kysely: Kysely<Database>;
  private migrated: Promise<Kysely<Database>> | null = null;

  constructor(private readonly path: string) {
    this.kysely = new Kysely<Database>({
      dialect: new SqliteDialect({
        database: async () => {
          if (path !== ':memory:') await mkdir(dirname(path), { recursive: true });
          return nodeSqliteDatabase(path);
        },
      }),
    });
  }

  async close(): Promise<void> {
    await this.kysely.destroy();
  }

  /** The database, with its schema brought up to date the first time it's used. */
  private db(): Promise<Kysely<Database>> {
    this.migrated ??= this.migrate();
    return this.migrated;
  }

  private async migrate(): Promise<Kysely<Database>> {
    await sql`PRAGMA journal_mode = WAL`.execute(this.kysely);
    await sql`PRAGMA synchronous = NORMAL`.execute(this.kysely);
    await sql`PRAGMA foreign_keys = ON`.execute(this.kysely);
    const { error } = await new Migrator({ db: this.kysely, provider: migrationProvider }).migrateToLatest();
    // Never carry on with a database that isn't at the schema this version
    // expects. Most likely a newer version of Alto migrated it.
    if (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Alto can't open its database ${this.path} (${message}). It may be from a newer version of Alto.`,
      );
    }
    return this.kysely;
  }

  async loadConfig(): Promise<AltoConfig> {
    const db = await this.db();
    const remotes = await db.selectFrom('remotes').selectAll().orderBy('added_at').orderBy('name').execute();
    const folders = await db.selectFrom('folders').selectAll().orderBy('added_at').orderBy('id').execute();
    return {
      remotes: remotes.map((r) => ({
        name: r.name,
        // A provider this version of Alto doesn't offer (any more) is a plain
        // rclone remote: it keeps syncing.
        provider: r.provider !== null && isProviderId(r.provider) ? r.provider : null,
        addedAt: r.added_at,
      })),
      folders: folders.map((f) => ({
        id: f.id,
        remote: f.remote,
        localPath: f.local_path,
        remotePath: f.remote_path,
        addedAt: f.added_at,
        ...(f.paused ? { paused: true } : {}),
      })),
    };
  }

  /** Replace the stored config with `config`. Baselines of folder pairs that are gone go with them. */
  async saveConfig(config: AltoConfig): Promise<void> {
    const db = await this.db();
    await db.transaction().execute(async (trx) => {
      // Folders first: they reference their remote.
      await trx
        .deleteFrom('folders')
        .where(
          'id',
          'not in',
          config.folders.map((f) => f.id),
        )
        .execute();
      await trx
        .deleteFrom('remotes')
        .where(
          'name',
          'not in',
          config.remotes.map((r) => r.name),
        )
        .execute();
      if (config.remotes.length > 0) {
        await trx
          .insertInto('remotes')
          .values(config.remotes.map((r) => ({ name: r.name, provider: r.provider, added_at: r.addedAt })))
          .onConflict((oc) =>
            oc.column('name').doUpdateSet((eb) => ({
              provider: eb.ref('excluded.provider'),
              added_at: eb.ref('excluded.added_at'),
            })),
          )
          .execute();
      }
      if (config.folders.length > 0) {
        await trx
          .insertInto('folders')
          .values(
            config.folders.map((f) => ({
              id: f.id,
              remote: f.remote,
              local_path: f.localPath,
              remote_path: f.remotePath,
              added_at: f.addedAt,
              paused: f.paused ? 1 : 0,
            })),
          )
          .onConflict((oc) =>
            oc.column('id').doUpdateSet((eb) => ({
              remote: eb.ref('excluded.remote'),
              local_path: eb.ref('excluded.local_path'),
              remote_path: eb.ref('excluded.remote_path'),
              added_at: eb.ref('excluded.added_at'),
              paused: eb.ref('excluded.paused'),
            })),
          )
          .execute();
      }
    });
  }

  async loadBaseline(folderId: string): Promise<Baseline> {
    const db = await this.db();
    const rows = await db
      .selectFrom('baseline')
      .select(['path', 'is_dir', 'local_size', 'local_mtime', 'remote_size', 'remote_mtime'])
      .where('folder_id', '=', folderId)
      .execute();
    const baseline: Baseline = new Map();
    for (const r of rows) {
      baseline.set(r.path, {
        isDir: r.is_dir === 1,
        local: { size: r.local_size, mtime: r.local_mtime },
        remote: { size: r.remote_size, mtime: r.remote_mtime },
      });
    }
    return baseline;
  }

  async updateBaseline(folderId: string, changes: BaselineChanges): Promise<void> {
    const db = await this.db();
    const deletes = [...changes.deletes];
    const upserts = [...changes.upserts].map(([path, e]) => ({
      folder_id: folderId,
      path,
      is_dir: e.isDir ? 1 : 0,
      local_size: e.local.size,
      local_mtime: e.local.mtime,
      remote_size: e.remote.size,
      remote_mtime: e.remote.mtime,
    }));
    await db.transaction().execute(async (trx) => {
      for (let i = 0; i < deletes.length; i += CHUNK) {
        await trx
          .deleteFrom('baseline')
          .where('folder_id', '=', folderId)
          .where('path', 'in', deletes.slice(i, i + CHUNK))
          .execute();
      }
      for (let i = 0; i < upserts.length; i += CHUNK) {
        await trx
          .insertInto('baseline')
          .values(upserts.slice(i, i + CHUNK))
          .onConflict((oc) =>
            oc.columns(['folder_id', 'path']).doUpdateSet((eb) => ({
              is_dir: eb.ref('excluded.is_dir'),
              local_size: eb.ref('excluded.local_size'),
              local_mtime: eb.ref('excluded.local_mtime'),
              remote_size: eb.ref('excluded.remote_size'),
              remote_mtime: eb.ref('excluded.remote_mtime'),
            })),
          )
          .execute();
      }
    });
  }

  async deleteBaseline(folderId: string): Promise<void> {
    const db = await this.db();
    await db.deleteFrom('baseline').where('folder_id', '=', folderId).execute();
  }
}
