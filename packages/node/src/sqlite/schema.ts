/** Tables in Alto's database, as Kysely sees them. SQLite booleans are 0 or 1. */
export interface Database {
  remotes: RemotesTable;
  folders: FoldersTable;
  baseline: BaselineTable;
}

export interface RemotesTable {
  name: string;
  provider: string | null;
  added_at: number;
}

export interface FoldersTable {
  id: string;
  remote: string;
  local_path: string;
  remote_path: string;
  added_at: number;
  paused: number;
}

export interface BaselineTable {
  folder_id: string;
  path: string;
  is_dir: number;
  local_size: number;
  local_mtime: number;
  remote_size: number;
  remote_mtime: number;
}
