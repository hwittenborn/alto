import { app } from 'electron';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { assetPath, configDir } from './paths';

interface Preferences {
  /** The "still running in the background" notice was shown once. */
  backgroundNoticeShown: boolean;
}

const file = () => path.join(configDir(), 'preferences.json');

export function loadPreferences(): Preferences {
  try {
    return { backgroundNoticeShown: false, ...JSON.parse(readFileSync(file(), 'utf8')) };
  } catch {
    return { backgroundNoticeShown: false };
  }
}

export function savePreferences(prefs: Preferences): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(file(), JSON.stringify(prefs, null, 2));
}

// Same name as the launcher the deb/rpm packages install (package.json `desktopName`).
const AUTOSTART_FILE = 'alto.desktop';

function autostartPath(): string {
  const base = process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config');
  return path.join(base, 'autostart', AUTOSTART_FILE);
}

export function isAutostartEnabled(): boolean {
  try {
    readFileSync(autostartPath());
    return true;
  } catch {
    return false;
  }
}

/** Start Alto in the background at login (XDG autostart). */
export function setAutostart(enabled: boolean): boolean {
  const target = autostartPath();
  if (!enabled) {
    rmSync(target, { force: true });
    return false;
  }
  // AppImages must be relaunched through the AppImage, not the extracted binary.
  const exec = process.env.APPIMAGE ?? process.execPath;
  const args = app.isPackaged ? '' : ` "${app.getAppPath()}"`;
  const entry = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Alto',
    'Comment=Keep your files in sync with the cloud',
    `Exec="${exec}"${args} --background`,
    `Icon=${assetPath('icons', 'hicolor', '256x256', 'com.hunterwittenborn.Alto.png')}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, entry);
  return true;
}
