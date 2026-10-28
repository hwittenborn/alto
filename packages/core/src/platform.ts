import type { ProviderId } from './providers.ts';

/** Minimal access to the local file system that the engine needs beyond rclone. */
export interface LocalFs {
  /** The user's home directory (used for `~` display and path expansion). */
  readonly homeDir: string;
  stat(path: string): Promise<{ isDir: boolean } | null>;
  /** Read a small text file. Returns null when the file doesn't exist. */
  readTextFile(path: string): Promise<string | null>;
  writeTextFile(path: string, content: string): Promise<void>;
  /**
   * Move a file or folder to the trash. When provided, local deletions caused
   * by remote deletions go to the trash instead of being permanent.
   */
  trash?(path: string): Promise<void>;
  /**
   * Watch a folder recursively. `onChange` receives the changed path relative
   * to `path` when known. Returns a function that stops watching.
   */
  watch?(path: string, onChange: (relPath?: string) => void): () => void;
}

/** Everything platform specific that Alto's core needs. */
export interface Platform {
  localFs: LocalFs;
  /** Name of this machine, used in conflict copy file names. */
  hostName: string;
  /** Open an authorization URL in the user's browser. */
  openAuthUrl(url: string, provider: ProviderId): Promise<void> | void;
  /** Optional logger. */
  log?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, ...data: unknown[]) => void;
}
