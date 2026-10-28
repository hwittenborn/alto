import { type AltoState, lastCheckedText } from '@alto/core';

import { Menu, nativeImage, Tray } from 'electron';
import { assetPath } from './paths';

export interface TrayActions {
  open(): void;
  syncNow(): void;
  quit(): void;
}

/** How often "Last checked …" is brought up to date. */
const REFRESH_INTERVAL = 30_000;

/** Status icon in the panel (StatusNotifierItem), mirroring the overall sync status. */
export class AltoTray {
  private tray: Tray | null = null;
  private state: AltoState | null = null;
  private lastKey = '';
  private readonly refresh = setInterval(() => this.render(), REFRESH_INTERVAL);

  constructor(private readonly actions: TrayActions) {}

  update(state: AltoState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    const state = this.state;
    if (!state) return;
    const icon = state.error ? 'warning' : state.overall.kind;
    const message = state.error ? 'An error occurred.' : state.overall.message || 'Awaiting sync checks…';
    const checked = state.overall.lastCheckedAt === null ? null : lastCheckedText(state.overall.lastCheckedAt);
    const key = `${icon}|${message}|${checked}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    if (process.env.ALTO_DEBUG) console.debug(`Tray: ${icon}, ${message} (${checked ?? 'not checked yet'})`);

    const image = nativeImage.createFromPath(assetPath('tray', `${icon}.png`));
    if (!this.tray) {
      try {
        this.tray = new Tray(image);
      } catch {
        return; // No status notifier host (e.g. headless sessions).
      }
      this.tray.on('click', () => this.actions.open());
    } else {
      this.tray.setImage(image);
    }
    this.tray.setToolTip(`Alto — ${message}`);
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: message, enabled: false },
        ...(checked ? [{ label: checked, enabled: false }] : []),
        { type: 'separator' },
        { label: 'Open', click: () => this.actions.open() },
        { label: 'Sync Now', click: () => this.actions.syncNow() },
        { type: 'separator' },
        { label: 'Quit', click: () => this.actions.quit() },
      ]),
    );
  }

  destroy(): void {
    clearInterval(this.refresh);
    this.tray?.destroy();
    this.tray = null;
  }
}
