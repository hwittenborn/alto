import { app } from 'electron';
import path from 'node:path';

/** Directory for Alto's configuration and state (`~/.config/alto`). */
export function configDir(): string {
  return process.env.ALTO_CONFIG_DIR ?? path.join(app.getPath('appData'), 'alto');
}

export function cacheDir(): string {
  const base = process.env.XDG_CACHE_HOME ?? path.join(app.getPath('home'), '.cache');
  return process.env.ALTO_CONFIG_DIR ? path.join(process.env.ALTO_CONFIG_DIR, 'cache') : path.join(base, 'alto');
}

/** Bundled asset (tray icons, auth page images, app icon). */
export function assetPath(...parts: string[]): string {
  const base = app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(app.getAppPath(), 'assets');
  return path.join(base, ...parts);
}

/**
 * The rclone binary bundled with Alto (forge.config.ts): in its resources once
 * packaged, and where the build downloaded it to under `npm start`.
 */
export function bundledRclone(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'rclone')
    : path.join(app.getAppPath(), '.rclone', process.arch, 'rclone');
}
