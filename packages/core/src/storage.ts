import type { ProviderId } from './providers.ts';
import type { Baseline, BaselineEntry } from './sync/types.ts';

export interface RemoteRecord {
  /** rclone remote name (also the display name). */
  name: string;
  provider: ProviderId | null;
  addedAt: number;
}

export interface FolderRecord {
  id: string;
  remote: string;
  /** Absolute local path, no trailing slash. */
  localPath: string;
  /** Path on the remote, no leading or trailing slash ("" = root). */
  remotePath: string;
  addedAt: number;
  paused?: boolean;
}

export interface AltoConfig {
  remotes: RemoteRecord[];
  folders: FolderRecord[];
}

export function emptyConfig(): AltoConfig {
  return { remotes: [], folders: [] };
}

export interface BaselineChanges {
  upserts: Map<string, BaselineEntry>;
  deletes: Set<string>;
}

/**
 * Persistence used by Alto. Implementations exist for SQLite (Electron, via
 * Kysely over `node:sqlite`) and memory (tests). A React Native app could
 * back it with MMKV, SQLite or AsyncStorage.
 */
export interface AltoStorage {
  loadConfig(): Promise<AltoConfig>;
  saveConfig(config: AltoConfig): Promise<void>;
  loadBaseline(folderId: string): Promise<Baseline>;
  /** Apply incremental changes to a folder's baseline. */
  updateBaseline(folderId: string, changes: BaselineChanges): Promise<void>;
  deleteBaseline(folderId: string): Promise<void>;
}

/** Storage that keeps everything in memory. Useful for tests and previews. */
export class MemoryStorage implements AltoStorage {
  private config: AltoConfig = emptyConfig();
  private readonly baselines = new Map<string, Baseline>();

  async loadConfig(): Promise<AltoConfig> {
    return structuredClone(this.config);
  }

  async saveConfig(config: AltoConfig): Promise<void> {
    this.config = structuredClone(config);
  }

  async loadBaseline(folderId: string): Promise<Baseline> {
    return new Map(this.baselines.get(folderId) ?? []);
  }

  async updateBaseline(folderId: string, changes: BaselineChanges): Promise<void> {
    const baseline = this.baselines.get(folderId) ?? new Map();
    for (const path of changes.deletes) baseline.delete(path);
    for (const [path, entry] of changes.upserts) baseline.set(path, entry);
    this.baselines.set(folderId, baseline);
  }

  async deleteBaseline(folderId: string): Promise<void> {
    this.baselines.delete(folderId);
  }
}
