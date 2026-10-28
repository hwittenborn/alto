import { type Kysely, sql } from 'kysely';

// Migrations take an untyped database: they must keep working as `Database` changes.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('remotes')
    .addColumn('name', 'text', (col) => col.primaryKey().notNull())
    .addColumn('provider', 'text')
    .addColumn('added_at', 'integer', (col) => col.notNull())
    .execute();

  // A folder pair only exists while its remote does: Alto removes both together.
  await db.schema
    .createTable('folders')
    .addColumn('id', 'text', (col) => col.primaryKey().notNull())
    .addColumn('remote', 'text', (col) => col.notNull().references('remotes.name'))
    .addColumn('local_path', 'text', (col) => col.notNull())
    .addColumn('remote_path', 'text', (col) => col.notNull())
    .addColumn('added_at', 'integer', (col) => col.notNull())
    .addColumn('paused', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();
  await db.schema.createIndex('folders_remote').on('folders').column('remote').execute();

  // The last synced state is only meaningful for a folder pair that exists.
  await db.schema
    .createTable('baseline')
    .addColumn('folder_id', 'text', (col) => col.notNull().references('folders.id').onDelete('cascade'))
    .addColumn('path', 'text', (col) => col.notNull())
    .addColumn('is_dir', 'integer', (col) => col.notNull())
    .addColumn('local_size', 'integer', (col) => col.notNull())
    .addColumn('local_mtime', 'integer', (col) => col.notNull())
    .addColumn('remote_size', 'integer', (col) => col.notNull())
    .addColumn('remote_mtime', 'integer', (col) => col.notNull())
    .addPrimaryKeyConstraint('baseline_pk', ['folder_id', 'path'])
    .modifyEnd(sql`without rowid`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('baseline').execute();
  await db.schema.dropTable('folders').execute();
  await db.schema.dropTable('remotes').execute();
}
