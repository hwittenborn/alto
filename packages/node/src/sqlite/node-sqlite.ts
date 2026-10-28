import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { SqliteDatabase, SqliteStatement } from 'kysely';

type Parameters = ReadonlyArray<unknown>;

/**
 * Presents Node's built-in `node:sqlite` as the better-sqlite3 interface
 * Kysely's `SqliteDialect` expects. Electron ships `node:sqlite`, so there's
 * no native module to rebuild against Alto's Electron.
 */
export function nodeSqliteDatabase(path: string): SqliteDatabase {
  const db = new DatabaseSync(path);
  return {
    close: () => db.close(),
    prepare: (sql) => statement(db.prepare(sql)),
  };
}

function statement(stmt: StatementSync): SqliteStatement {
  // `node:sqlite` binds spread arguments where better-sqlite3 takes an array.
  const args = (parameters: Parameters) => parameters as never[];
  return {
    reader: stmt.columns().length > 0,
    all: (parameters) => stmt.all(...args(parameters)),
    run: (parameters) => stmt.run(...args(parameters)),
    iterate: (parameters) => stmt.iterate(...args(parameters)),
  };
}
