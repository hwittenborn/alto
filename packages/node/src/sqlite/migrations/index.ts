import type { Migration, MigrationProvider } from 'kysely/migration';
import * as initial from './0001-initial.ts';

/**
 * Every migration, in order. They're imported rather than read from a folder
 * at runtime so Vite bundles them into Electron's main process.
 */
const migrations: Record<string, Migration> = {
  '0001-initial': initial,
};

export const migrationProvider: MigrationProvider = {
  getMigrations: async () => migrations,
};
