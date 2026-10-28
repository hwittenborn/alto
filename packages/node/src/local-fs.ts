import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, relative } from 'node:path';
import type { LocalFs } from '@alto/core';
import { watch as chokidarWatch } from 'chokidar';

export interface NodeLocalFsOptions {
  homeDir?: string;
  /**
   * Moves a file or folder to the trash, e.g. Electron's `shell.trashItem`.
   * Without it, local deletions are permanent.
   */
  trash?: (path: string) => Promise<void>;
  /** Watch folders for changes. Default true. */
  watch?: boolean;
}

/** `LocalFs` for Node.js and Electron. */
export class NodeLocalFs implements LocalFs {
  readonly homeDir: string;
  readonly trash?: (path: string) => Promise<void>;
  readonly watch?: (path: string, onChange: (relPath?: string) => void) => () => void;

  constructor(options: NodeLocalFsOptions = {}) {
    this.homeDir = options.homeDir ?? homedir();
    this.trash = options.trash;
    if (options.watch !== false) {
      this.watch = (path, onChange) => {
        const watcher = chokidarWatch(path, {
          ignoreInitial: true,
          // rclone writes downloads to `*.partial` files first; ignore them.
          ignored: (p: string) => /\.[0-9a-z]{6,}\.partial$/i.test(p),
          // Every change is reported right away: files still being written
          // are held back by the sync engine (SETTLE_TIME). chokidar's
          // awaitWriteFinish would drop the deletion of a file it hadn't
          // reported yet, which a sync may have uploaded already.
        });
        watcher.on('all', (_event, changed) => onChange(relative(path, changed)));
        watcher.on('error', () => {});
        return () => {
          void watcher.close();
        };
      };
    }
  }

  async stat(path: string): Promise<{ isDir: boolean } | null> {
    try {
      const s = await stat(path);
      return { isDir: s.isDirectory() };
    } catch {
      return null;
    }
  }

  async readTextFile(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /** Write atomically (temp file + rename) so readers never see half a file. */
  async writeTextFile(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.alto-${process.pid}-${Date.now()}.tmp`;
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, path);
  }
}
