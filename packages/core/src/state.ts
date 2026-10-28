import type { ProviderId, ProviderValues } from './providers.ts';
import type { FolderRecord } from './storage.ts';
import type { ConflictChoice, ConflictResolution, FolderRuntime } from './sync/folder.ts';
import type { ItemState, Side } from './sync/types.ts';

export interface RemoteUsage {
  used?: number;
  total?: number;
  free?: number;
}

export interface RemoteView {
  name: string;
  provider: ProviderId | null;
  /** Short account description (`alice@cloud.example.com`), when known. */
  account: string | null;
  usage: RemoteUsage | null;
}

export interface FolderView extends FolderRecord {
  runtime: FolderRuntime;
}

export type LoginStatus = 'starting' | 'waiting' | 'verifying' | 'done' | 'failed' | 'cancelled';

/** A browser-based (OAuth) login in progress. */
export interface LoginView {
  name: string;
  provider: ProviderId;
  status: LoginStatus;
  authUrl: string | null;
  error: string | null;
}

export type OverallKind = 'loading' | 'syncing' | 'paused' | 'warning' | 'done' | 'offline';

export interface OverallStatus {
  kind: OverallKind;
  /** Number of issues across all folders. */
  issues: number;
  /** Human readable summary (tray tooltip, etc). */
  message: string;
  /**
   * The oldest of the folders' last checks (paused folders aside): every folder
   * has been compared with its server since. Null until each has been.
   */
  lastCheckedAt: number | null;
}

export interface AltoState {
  /** Increases with every change; lets remote clients order replies after the state they caused. */
  revision: number;
  ready: boolean;
  /** Fatal startup error, if any. */
  error: string | null;
  rcloneVersion: string | null;
  homeDir: string;
  hostName: string;
  remotes: RemoteView[];
  folders: FolderView[];
  logins: LoginView[];
  overall: OverallStatus;
}

export interface ActionError {
  /** Machine readable code (e.g. `remote-missing`, `auth`, `connect`). */
  code: string;
  /** Headline. */
  message: string;
  /** Explanation, shown below the headline. */
  body?: string;
  /** Raw technical error text (e.g. from rclone), for a details view. */
  detail?: string;
}

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: ActionError };

export interface CreateRemoteInput {
  provider: ProviderId;
  name: string;
  values: ProviderValues;
}

export interface AddFolderInput {
  remote: string;
  localPath: string;
  /** Created when it doesn't exist yet. */
  remotePath: string;
}

/** Commands understood by Alto. Implemented in-process by `Alto` and over IPC by `createAltoClient`. */
export interface AltoApi {
  createRemote(input: CreateRemoteInput): Promise<ActionResult<{ name: string }>>;
  /** Log in to an OAuth provider in the browser. Progress is reported in `state.logins`. */
  loginWithBrowser(input: { provider: ProviderId; name: string }): Promise<ActionResult<{ name: string }>>;
  cancelLogin(name: string): Promise<void>;
  deleteRemote(name: string): Promise<void>;
  refreshRemoteUsage(name: string): Promise<void>;
  /** Names of the folders directly inside `path` on a remote. */
  listRemoteFolders(remote: string, path: string): Promise<string[]>;
  /** Make a folder on a remote, and the folders above it that don't exist yet. */
  createRemoteFolder(remote: string, path: string): Promise<ActionResult<{ path: string }>>;
  addFolder(input: AddFolderInput): Promise<ActionResult<{ id: string }>>;
  removeFolder(id: string): Promise<void>;
  setFolderPaused(id: string, paused: boolean): Promise<void>;
  getExclusions(id: string): Promise<string[]>;
  setExclusions(id: string, patterns: string[]): Promise<void>;
  dismissIssue(folderId: string, issueId: string): Promise<void>;
  inspectConflict(folderId: string, path: string): Promise<{ local: ItemState | null; remote: ItemState | null }>;
  resolveConflict(folderId: string, path: string, choice: ConflictChoice): Promise<ActionResult<ConflictResolution>>;
  resolveMassDeletion(folderId: string, side: Side, choice: 'delete' | 'restore'): Promise<void>;
  syncNow(folderId?: string): Promise<void>;
  /** Sync every folder of one remote. */
  syncRemote(name: string): Promise<void>;
}

export const ALTO_API_METHODS = [
  'createRemote',
  'loginWithBrowser',
  'cancelLogin',
  'deleteRemote',
  'refreshRemoteUsage',
  'listRemoteFolders',
  'createRemoteFolder',
  'addFolder',
  'removeFolder',
  'setFolderPaused',
  'getExclusions',
  'setExclusions',
  'dismissIssue',
  'inspectConflict',
  'resolveConflict',
  'resolveMassDeletion',
  'syncNow',
  'syncRemote',
] as const satisfies ReadonlyArray<keyof AltoApi>;

export type AltoApiMethod = (typeof ALTO_API_METHODS)[number];

export function initialState(homeDir = '', hostName = ''): AltoState {
  return {
    revision: 0,
    ready: false,
    error: null,
    rcloneVersion: null,
    homeDir,
    hostName,
    remotes: [],
    folders: [],
    logins: [],
    overall: { kind: 'loading', issues: 0, message: '', lastCheckedAt: null },
  };
}
