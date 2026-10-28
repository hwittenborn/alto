import { nanoid } from 'nanoid/non-secure';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { overallStatus } from './describe.ts';
import { EXCLUSION_FILE_NAME, parseExclusionFile, serializeExclusionFile } from './exclusions.ts';

import { baseName, formatLocalPath, isWithin, joinPath, normalizeLocalPath, normalizeRemotePath } from './paths.ts';
import type { Platform } from './platform.ts';
import { buildRemoteConfig, describeAccount, detectProvider, getProvider, type ProviderId } from './providers.ts';
import type { RcloneClient } from './rclone/client.ts';
import {
  type ActionError,
  type ActionResult,
  type AddFolderInput,
  type AltoApi,
  type AltoState,
  type CreateRemoteInput,
  type FolderView,
  initialState,
  type LoginView,
  type RemoteView,
} from './state.ts';
import { type AltoConfig, type AltoStorage, emptyConfig, type FolderRecord } from './storage.ts';
import { SyncEngine } from './sync/engine.ts';
import type { ConflictChoice, ConflictResolution } from './sync/folder.ts';
import type { ItemState, Side } from './sync/types.ts';
import { validateLoginForm } from './validation.ts';

export interface AltoOptions {
  rclone: RcloneClient;
  storage: AltoStorage;
  platform: Platform;
  /** Remote poll interval in ms (default 30 s). */
  pollInterval?: number;
  /** Delay before syncing after a local change, in ms (default 0.5 s). */
  debounce?: number;
  transferConcurrency?: number;
  folderConcurrency?: number;
  /** Start syncing automatically after `start()`. Default true (tests drive cycles by hand). */
  autoSync?: boolean;
}

/** Everything a UI needs: commands plus an observable state store. */
export interface AltoClient extends AltoApi {
  readonly store: StoreApi<AltoState>;
}

const fail = (
  code: string,
  message: string,
  extra: { body?: string; detail?: string } = {},
): { ok: false; error: ActionError } => {
  const error: ActionError = { code, message };
  if (extra.body !== undefined) error.body = extra.body;
  if (extra.detail !== undefined) error.detail = extra.detail;
  return { ok: false, error };
};

const TLS_MESSAGE =
  'Unable to set up a secure connection to the server. Check that its certificate is valid and try again.';

/** Map an rclone login failure onto a friendly explanation. */
function loginError(err: unknown): ActionError {
  const text = err instanceof Error ? err.message : String(err);
  let message: string;
  let code = 'auth';
  if (/x509|certificate|\btls\b/i.test(text)) {
    code = 'tls';
    message = TLS_MESSAGE;
  } else if (
    /name resolution|no such host|connection refused|dial tcp|network is unreachable|i\/o timeout/i.test(text)
  ) {
    code = 'connect';
    message = 'Unable to connect to the server. Check your internet connection and try again.';
  } else if (/directory not found|404 not found/i.test(text)) {
    // The server answered, but there's nothing at the URL (e.g. a Nextcloud
    // URL pointing at the wrong server or path).
    code = 'not-found';
    message = "The server was reached, but its files weren't found there. Check the server URL and try again.";
  } else if (/2FA|two.?factor/i.test(text)) {
    code = '2fa';
    message = 'A 2FA code is required to log in to this account. Provide one and try again.';
  } else {
    message = 'Unable to authenticate to the server. Check your login credentials and try again.';
  }
  return { code, message, detail: text };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The Alto application core: owns the configuration, remotes, logins and the
 * sync engine, and exposes them as commands plus an observable state store.
 *
 * It runs anywhere JavaScript and an rclone rc endpoint are available: the
 * Electron main process today, a React Native JS thread tomorrow.
 */
export class Alto implements AltoClient {
  readonly store: StoreApi<AltoState>;
  readonly engine: SyncEngine;
  private readonly rclone: RcloneClient;
  private readonly storage: AltoStorage;
  private readonly platform: Platform;
  private config: AltoConfig = emptyConfig();
  private remoteConfigs = new Map<string, Record<string, string>>();
  private usage = new Map<string, RemoteView['usage']>();
  private readonly logins = new Map<string, LoginView & { abort: AbortController }>();
  private notifyScheduled = false;
  private started = false;
  private readonly autoSync: boolean;

  constructor(options: AltoOptions) {
    this.rclone = options.rclone;
    this.storage = options.storage;
    this.platform = options.platform;
    this.autoSync = options.autoSync ?? true;
    this.store = createStore<AltoState>(() =>
      initialState(options.platform.localFs.homeDir, options.platform.hostName),
    );
    this.engine = new SyncEngine({
      rclone: options.rclone,
      storage: options.storage,
      platform: options.platform,
      pollInterval: options.pollInterval,
      debounce: options.debounce,
      transferConcurrency: options.transferConcurrency,
      folderConcurrency: options.folderConcurrency,
      onChange: () => this.scheduleNotify(),
    });
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...data: unknown[]) {
    this.platform.log?.(level, message, ...data);
  }

  // --- lifecycle -------------------------------------------------------------

  /** Load configuration, connect to rclone and start syncing. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      const version = await this.rclone.version();
      this.config = await this.storage.loadConfig();
      await this.refreshRemotes();
      for (const folder of this.config.folders) this.engine.add({ ...folder });
      this.setState({ ready: true, rcloneVersion: version.version, error: null });
      if (this.autoSync) this.engine.start();
      this.notify();
      for (const remote of this.config.remotes) void this.refreshRemoteUsage(remote.name);
    } catch (err) {
      this.log('error', 'Failed to start', err);
      this.setState({
        ready: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async stop(): Promise<void> {
    await this.engine.stop();
    for (const login of this.logins.values()) login.abort.abort();
  }

  private async saveConfig(): Promise<void> {
    await this.storage.saveConfig(this.config);
  }

  // --- state -----------------------------------------------------------------

  private scheduleNotify(): void {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    setTimeout(() => {
      this.notifyScheduled = false;
      this.notify();
    }, 50);
  }

  private setState(partial: Partial<Omit<AltoState, 'revision'>>): void {
    this.store.setState({ ...partial, revision: this.store.getState().revision + 1 });
  }

  private notify(): void {
    const remotes: RemoteView[] = this.config.remotes.map((r) => {
      const cfg = this.remoteConfigs.get(r.name) ?? {};
      return {
        name: r.name,
        provider: r.provider,
        account: describeAccount(cfg),
        usage: this.usage.get(r.name) ?? null,
      };
    });
    const folders: FolderView[] = this.config.folders.map((f) => {
      const folder = this.engine.get(f.id);
      return {
        ...f,
        runtime: folder?.runtime ?? {
          phase: 'error',
          message: `The remote '${f.remote}' is missing from rclone's configuration.`,
          lastCheckedAt: null,
          progress: null,
          issues: [],
        },
      };
    });
    const logins = [...this.logins.values()].map(({ abort: _abort, ...view }) => view);
    this.setState({ remotes, folders, logins, overall: overallStatus(folders) });
  }

  // --- remotes ---------------------------------------------------------------

  /** Re-read remotes from rclone and reconcile them with Alto's config. */
  private async refreshRemotes(): Promise<void> {
    const dump = await this.rclone.dumpConfig();
    this.remoteConfigs = new Map(Object.entries(dump));
    const known = new Set(this.config.remotes.map((r) => r.name));
    let changed = false;
    // Remotes added to rclone.conf by hand show up too.
    for (const [name, cfg] of this.remoteConfigs) {
      if (!known.has(name)) {
        this.config.remotes.push({ name, provider: detectProvider(cfg), addedAt: Date.now() });
        changed = true;
      }
    }
    // Remotes removed from rclone.conf take their folder pairs with them.
    const gone = this.config.folders.filter((f) => !this.remoteConfigs.has(f.remote));
    for (const f of gone) await this.engine.remove(f.id);
    this.config.folders = this.config.folders.filter((f) => this.remoteConfigs.has(f.remote));
    const before = this.config.remotes.length;
    this.config.remotes = this.config.remotes.filter((r) => this.remoteConfigs.has(r.name));
    if (this.config.remotes.length !== before || gone.length > 0) changed = true;
    for (const r of this.config.remotes) {
      const detected = detectProvider(this.remoteConfigs.get(r.name) ?? {});
      if (detected && detected !== r.provider) {
        r.provider = detected;
        changed = true;
      }
    }
    if (changed) await this.saveConfig();
  }

  private existingRemoteNames(): string[] {
    return [...this.remoteConfigs.keys()];
  }

  private async verifyLogin(name: string): Promise<void> {
    await this.rclone.stat(`${name}:`, '', { noMimeType: true });
  }

  private async addRemoteRecord(name: string, provider: ProviderId): Promise<void> {
    await this.rclone.clearFsCache().catch(() => {});
    await this.refreshRemotes();
    const record = this.config.remotes.find((r) => r.name === name);
    if (record) record.provider = provider;
    await this.saveConfig();
    this.notify();
    void this.refreshRemoteUsage(name);
  }

  async createRemote(input: CreateRemoteInput): Promise<ActionResult<{ name: string }>> {
    const provider = getProvider(input.provider);
    if (provider.auth === 'oauth') {
      return this.loginWithBrowser({ provider: input.provider, name: input.name });
    }
    const name = input.name.trim();
    const validation = validateLoginForm(input.provider, name, input.values, this.existingRemoteNames());
    if (!validation.valid) {
      const first = Object.values(validation.errors)[0] ?? '';
      return fail('invalid', 'Unable to log in', { body: first });
    }

    const cfg = buildRemoteConfig(input.provider, input.values);
    try {
      await this.rclone.createRemote(name, cfg.type, cfg.parameters, {
        obscure: cfg.obscure,
        nonInteractive: true,
      });
      await this.rclone.clearFsCache().catch(() => {});
      await this.verifyLogin(name);
    } catch (err) {
      await this.rclone.deleteRemote(name).catch(() => {});
      await this.rclone.clearFsCache().catch(() => {});
      const error = loginError(err);
      return fail(error.code, 'Unable to log in', { body: error.message, detail: error.detail });
    }

    await this.addRemoteRecord(name, input.provider);
    return { ok: true, value: { name } };
  }

  async loginWithBrowser(input: { provider: ProviderId; name: string }): Promise<ActionResult<{ name: string }>> {
    const provider = getProvider(input.provider);
    const name = input.name.trim();
    const validation = validateLoginForm(input.provider, name, {}, this.existingRemoteNames());
    if (!validation.valid) {
      return fail('invalid', 'Unable to log in', { body: validation.errors.name });
    }
    if (
      [...this.logins.values()].some(
        (l) => l.status === 'starting' || l.status === 'waiting' || l.status === 'verifying',
      )
    ) {
      return fail('busy', 'Another login is already in progress.');
    }

    const abort = new AbortController();
    const login: LoginView & { abort: AbortController } = {
      name,
      provider: input.provider,
      status: 'starting',
      authUrl: null,
      error: null,
      abort,
    };
    this.logins.set(name, login);
    const set = (patch: Partial<LoginView>) => {
      Object.assign(login, patch);
      this.notify();
    };
    set({});

    const cfg = buildRemoteConfig(input.provider, {});
    let finished = false;
    const job = this.rclone
      .createRemoteAsync(name, cfg.type, cfg.parameters, { obscure: cfg.obscure }, { signal: abort.signal })
      .finally(() => {
        finished = true;
      });
    job.catch(() => {});

    try {
      // Wait for rclone's OAuth server to come up, then send the user to it.
      while (!finished && !abort.signal.aborted) {
        const status = await this.rclone.oauthStatus().catch(() => ({ status: undefined, authUrl: undefined }));
        if (status.status === 'running' && status.authUrl) {
          set({ status: 'waiting', authUrl: status.authUrl });
          await this.platform.openAuthUrl(status.authUrl, input.provider);
          break;
        }
        await delay(300);
      }
      await job;
      if (abort.signal.aborted) throw new Error('cancelled');
      set({ status: 'verifying' });
      await this.rclone.clearFsCache().catch(() => {});
      await this.verifyLogin(name);
    } catch (err) {
      await this.rclone.oauthStop().catch(() => {});
      await this.rclone.deleteRemote(name).catch(() => {});
      await this.rclone.clearFsCache().catch(() => {});
      if (abort.signal.aborted) {
        this.logins.delete(name);
        this.notify();
        return fail('cancelled', 'Login cancelled.');
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logins.delete(name);
      this.notify();
      return fail('auth', `There was an issue authenticating to ${provider.label}`, { detail: message });
    }

    this.logins.delete(name);
    await this.addRemoteRecord(name, input.provider);
    return { ok: true, value: { name } };
  }

  async cancelLogin(name: string): Promise<void> {
    const login = this.logins.get(name);
    if (!login) return;
    login.status = 'cancelled';
    login.abort.abort();
    await this.rclone.oauthStop().catch(() => {});
    this.notify();
  }

  async deleteRemote(name: string): Promise<void> {
    const folders = this.config.folders.filter((f) => f.remote === name);
    for (const f of folders) await this.engine.remove(f.id);
    this.config.folders = this.config.folders.filter((f) => f.remote !== name);
    this.config.remotes = this.config.remotes.filter((r) => r.name !== name);
    await this.saveConfig();
    await this.rclone.deleteRemote(name).catch((err) => this.log('warn', 'config/delete failed', err));
    await this.rclone.clearFsCache().catch(() => {});
    this.engine.forgetRemoteInfo(name);
    this.remoteConfigs.delete(name);
    this.usage.delete(name);
    this.notify();
  }

  async refreshRemoteUsage(name: string): Promise<void> {
    try {
      const about = await this.rclone.about(`${name}:`);
      this.usage.set(name, { used: about.used, total: about.total, free: about.free });
    } catch {
      this.usage.set(name, null);
    }
    this.scheduleNotify();
  }

  async listRemoteFolders(remote: string, path: string): Promise<string[]> {
    try {
      const items = await this.rclone.list(`${remote}:`, normalizeRemotePath(path), {
        dirsOnly: true,
        noMimeType: true,
        noModTime: true,
      });
      return items.map((i) => i.Name).sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  async createRemoteFolder(remote: string, path: string): Promise<ActionResult<{ path: string }>> {
    const folder = normalizeRemotePath(path);
    const name = baseName(folder);
    if (name === '' || name === '.' || name === '..') return fail('invalid', 'Enter a name for the folder');
    try {
      await this.rclone.mkdir(`${remote}:`, folder);
    } catch (err) {
      return fail('remote-mkdir', `Unable to create '/${folder}'`, {
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    return { ok: true, value: { path: folder } };
  }

  // --- folders ---------------------------------------------------------------

  async addFolder(input: AddFolderInput): Promise<ActionResult<{ id: string }>> {
    const fs = this.platform.localFs;
    const rawLocal = input.localPath.trim();
    if (!rawLocal.startsWith('/') && !rawLocal.startsWith('~')) {
      return fail('local-relative', 'Enter the full path of the local folder', {
        body: 'The path needs to start with “/” or “~”.',
      });
    }
    const localPath = normalizeLocalPath(rawLocal.startsWith('~') ? rawLocal.replace(/^~/, fs.homeDir) : rawLocal);
    const remotePath = normalizeRemotePath(input.remotePath);
    const remote = input.remote;

    if (!this.remoteConfigs.has(remote)) {
      return fail('unknown-remote', `The remote '${remote}' is missing from rclone's configuration.`);
    }
    const stat = await fs.stat(localPath);
    if (!stat) return fail('local-missing', "The local folder doesn't exist");
    if (!stat.isDir) return fail('local-not-dir', 'The local path is a file, not a folder');
    if (localPath === '/') return fail('local-root', "The root folder can't be synced.");

    for (const f of this.config.folders) {
      if (f.localPath === localPath && f.remote === remote && f.remotePath === remotePath) {
        return fail('duplicate', 'These folders are already being synced');
      }
      if (isWithin(localPath, f.localPath) || isWithin(f.localPath, localPath)) {
        return fail(
          'local-overlap',
          `'${formatLocalPath(localPath, fs.homeDir)}' overlaps with a folder that is already being synced.`,
          { body: "Synced folders can't be inside one another." },
        );
      }
      if (f.remote === remote && (isWithin(remotePath, f.remotePath) || isWithin(f.remotePath, remotePath))) {
        return fail('remote-overlap', `'/${remotePath}' overlaps with a remote folder that is already being synced.`, {
          body: "Synced folders can't be inside one another.",
        });
      }
    }

    try {
      const item =
        remotePath === '' ? { IsDir: true } : await this.rclone.stat(`${remote}:`, remotePath, { noMimeType: true });
      if (!item) {
        await this.rclone.mkdir(`${remote}:`, remotePath);
      } else if (!item.IsDir) {
        return fail('remote-not-dir', 'The remote path is a file, not a folder');
      }
    } catch (err) {
      return fail('remote-check', 'Unable to check the remote folder', {
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    const record: FolderRecord = {
      id: nanoid(10),
      remote,
      localPath,
      remotePath,
      addedAt: Date.now(),
    };
    this.config.folders.push(record);
    await this.saveConfig();
    this.engine.add({ ...record });
    this.notify();
    return { ok: true, value: { id: record.id } };
  }

  async removeFolder(id: string): Promise<void> {
    await this.engine.remove(id);
    this.config.folders = this.config.folders.filter((f) => f.id !== id);
    await this.saveConfig();
    this.notify();
  }

  async setFolderPaused(id: string, paused: boolean): Promise<void> {
    const record = this.config.folders.find((f) => f.id === id);
    if (!record) return;
    record.paused = paused || undefined;
    await this.saveConfig();
    this.engine.get(id)?.setPaused(paused);
    if (!paused) this.engine.requestSync(id, 0);
    this.notify();
  }

  private folderRecord(id: string): FolderRecord {
    const record = this.config.folders.find((f) => f.id === id);
    if (!record) throw new Error(`Unknown folder '${id}'`);
    return record;
  }

  async getExclusions(id: string): Promise<string[]> {
    const record = this.folderRecord(id);
    const text = await this.platform.localFs.readTextFile(joinPath(record.localPath, EXCLUSION_FILE_NAME));
    return parseExclusionFile(text ?? '');
  }

  async setExclusions(id: string, patterns: string[]): Promise<void> {
    const record = this.folderRecord(id);
    await this.platform.localFs.writeTextFile(
      joinPath(record.localPath, EXCLUSION_FILE_NAME),
      serializeExclusionFile(patterns),
    );
    this.engine.requestSync(id, 300);
  }

  async dismissIssue(folderId: string, issueId: string): Promise<void> {
    this.engine.get(folderId)?.dismissIssue(issueId);
    this.notify();
  }

  async inspectConflict(
    folderId: string,
    path: string,
  ): Promise<{ local: ItemState | null; remote: ItemState | null }> {
    const folder = this.engine.get(folderId);
    if (!folder) throw new Error(`Unknown folder '${folderId}'`);
    return folder.inspect(path);
  }

  async resolveConflict(
    folderId: string,
    path: string,
    choice: ConflictChoice,
  ): Promise<ActionResult<ConflictResolution>> {
    const folder = this.engine.get(folderId);
    if (!folder) return fail('unknown-folder', `Unknown folder '${folderId}'`);
    try {
      const result = await folder.resolveConflict(path, choice);
      this.engine.requestSync(folderId, 250);
      return { ok: true, value: result };
    } catch (err) {
      return fail('resolve', `Unable to resolve the conflict for '${path}'.`, {
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async resolveMassDeletion(folderId: string, side: Side, choice: 'delete' | 'restore'): Promise<void> {
    await this.engine.get(folderId)?.resolveMassDeletion(side, choice);
    this.engine.requestSync(folderId, 0);
  }

  async syncNow(folderId?: string): Promise<void> {
    if (folderId) this.engine.requestSync(folderId, 0);
    else this.engine.syncAll();
  }

  async syncRemote(name: string): Promise<void> {
    this.engine.syncAll(name);
  }
}
