/**
 * Typed IPC channel definitions, modeled after GitHub Desktop's pattern.
 * The function signature IS the contract — params and return type are
 * extracted automatically via Parameters<> and ReturnType<>.
 */
import type { AltoState } from '@alto/core';

export interface AppInfo {
  version: string;
  configDir: string;
  autostart: boolean;
  /** Path of the rclone binary in use. */
  rclonePath: string;
}

/** Fire-and-forget messages (renderer -> main) */
export type RequestChannels = {
  'window:close': () => void;
  'window:minimize': () => void;
  'window:toggle-maximized': () => void;
  'window:set-decoration-insets': (top: number, right: number, bottom: number, left: number) => void;
  'app:quit': () => void;
};

/** Request-response channels (renderer -> main, returns Promise) */
export type RequestResponseChannels = {
  'alto:invoke': (method: string, args: unknown[]) => Promise<unknown>;
  'alto:get-state': () => Promise<AltoState>;
  'dialog:select-folder': (defaultPath?: string) => Promise<string | null>;
  'shell:open-path': (path: string) => Promise<void>;
  'shell:open-url': (url: string) => Promise<void>;
  'app:get-info': () => Promise<AppInfo>;
  'app:set-autostart': (enabled: boolean) => Promise<boolean>;
};

/** Events pushed from main to the renderer. */
export type MainEvents = {
  'alto:state': (state: AltoState) => void;
  'window:state-changed': (noShadow: boolean) => void;
  /** Ask the UI to show a folder (e.g. after clicking a notification). */
  'app:show-folder': (folderId: string) => void;
};
