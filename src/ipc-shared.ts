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
  rclonePath: string | null;
}

/**
 * Alto setting itself up before it starts: installing rclone, on the first
 * start or after an update. Without accounts, it waits (`pending`) until the
 * welcome page is left.
 */
export type SetupState =
  | { phase: 'pending' }
  | { phase: 'downloading'; received: number; total: number | null }
  | { phase: 'failed'; message: string };

/** Fire-and-forget messages (renderer -> main) */
export type RequestChannels = {
  'window:close': () => void;
  'window:minimize': () => void;
  'window:toggle-maximized': () => void;
  'window:set-decoration-insets': (top: number, right: number, bottom: number, left: number) => void;
  'app:quit': () => void;
  'app:retry-setup': () => void;
  /** The welcome page was left: a pending setup starts. */
  'app:start-setup': () => void;
};

/** Request-response channels (renderer -> main, returns Promise) */
export type RequestResponseChannels = {
  'alto:invoke': (method: string, args: unknown[]) => Promise<unknown>;
  'alto:get-state': () => Promise<AltoState>;
  'dialog:select-folder': (defaultPath?: string) => Promise<string | null>;
  'shell:open-path': (path: string) => Promise<void>;
  'shell:open-url': (url: string) => Promise<void>;
  'app:get-info': () => Promise<AppInfo>;
  /** Null once Alto is set up. */
  'app:get-setup': () => Promise<SetupState | null>;
  /** Whether Alto started without accounts, so it greets the user first. */
  'app:get-welcome': () => Promise<boolean>;
  'app:set-autostart': (enabled: boolean) => Promise<boolean>;
};

/** Events pushed from main to the renderer. */
export type MainEvents = {
  'alto:state': (state: AltoState) => void;
  'app:setup': (state: SetupState | null) => void;
  'window:state-changed': (noShadow: boolean) => void;
  /** Ask the UI to show a folder (e.g. after clicking a notification). */
  'app:show-folder': (folderId: string) => void;
};
