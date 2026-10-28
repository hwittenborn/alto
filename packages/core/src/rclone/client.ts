import type {
  RcloneAbout,
  RcloneConfigCreateOptions,
  RcloneErrorBody,
  RcloneFsInfo,
  RcloneJobStatus,
  RcloneListItem,
  RcloneListOptions,
  RcloneOAuthStatus,
  RcloneProviderInfo,
  RcloneStats,
  RcloneVersion,
} from './types.ts';

/** Error raised for failed rc calls (HTTP error status or transport failure). */
export class RcloneError extends Error {
  /** rc method that failed, e.g. `operations/list`. */
  readonly method: string;
  /** HTTP status code, or 0 for transport failures (rclone unreachable). */
  readonly status: number;
  readonly input?: unknown;

  constructor(method: string, message: string, status: number, input?: unknown) {
    super(message);
    this.name = 'RcloneError';
    this.method = method;
    this.status = status;
    this.input = input;
  }

  /** The error message returned by rclone (without the method prefix). */
  get detail(): string {
    return this.message;
  }

  /** Whether this is a "not found" type error (missing file or directory). */
  get isNotFound(): boolean {
    return (
      this.status === 404 ||
      /directory not found|object not found|file not found|not found|no such file/i.test(this.message)
    );
  }

  /**
   * Whether a listed directory doesn't exist: rclone's fs.ErrorDirNotFound,
   * which every backend returns for that, rather than any "not found".
   */
  get isDirNotFound(): boolean {
    return /\bdirectory not found\b/i.test(this.message);
  }

  /** Whether rclone itself could not be reached. */
  get isTransport(): boolean {
    return this.status === 0;
  }

  /** Whether the failure looks like a connectivity problem with the remote. */
  get isConnectivity(): boolean {
    return (
      this.isTransport ||
      /dial tcp|connection refused|no such host|name resolution|network is unreachable|i\/o timeout|timeout|connection reset|EOF|TLS handshake|tls:|couldn't connect|failed to connect/i.test(
        this.message,
      )
    );
  }

  /** Whether the failure looks like an authentication problem. */
  get isAuth(): boolean {
    return /401|403|unauthori[sz]ed|forbidden|authentication|auth failed|login|invalid credentials|token/i.test(
      this.message,
    );
  }
}

export interface RcloneClientOptions {
  /** Base URL of the rc server, e.g. `http://127.0.0.1:5572/`. */
  url: string;
  user?: string;
  pass?: string;
  /** Custom fetch implementation (React Native, tests, …). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Interval for polling async jobs, in ms. Default 250. */
  jobPollInterval?: number;
}

export interface CallOptions {
  signal?: AbortSignal;
}

export interface AsyncCallOptions extends CallOptions {
  /** Stats group to attach the job to (used for progress reporting and cancellation). */
  group?: string;
  /** Called on every poll while the job runs. */
  onPoll?: (status: RcloneJobStatus) => void;
}

function encodeBase64(text: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(text)));
  }
  // Runtimes without btoa (old Node): use Buffer.
  const { Buffer } = globalThis as unknown as {
    Buffer: { from(text: string, encoding: string): { toString(encoding: string): string } };
  };
  return Buffer.from(text, 'utf8').toString('base64');
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Thin, typed client for the rclone rc HTTP API.
 *
 * Works anywhere `fetch` exists (Node, Electron, browsers, React Native), so
 * the same client can drive a local `rclone rcd`, an embedded librclone
 * bridge exposing the rc API over HTTP, or a remote rclone instance.
 */
export class RcloneClient {
  readonly url: string;
  private readonly authHeader?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly jobPollInterval: number;

  constructor(options: RcloneClientOptions) {
    this.url = options.url.endsWith('/') ? options.url : `${options.url}/`;
    if (options.user !== undefined || options.pass !== undefined) {
      this.authHeader = `Basic ${encodeBase64(`${options.user ?? ''}:${options.pass ?? ''}`)}`;
    }
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.jobPollInterval = options.jobPollInterval ?? 250;
  }

  /** Call any rc method. */
  async call<T = unknown>(method: string, params: Record<string, unknown> = {}, options: CallOptions = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authHeader) headers.Authorization = this.authHeader;

    let response: Response;
    try {
      response = await this.fetchImpl(this.url + method, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
        signal: options.signal,
      });
    } catch (err) {
      if (options.signal?.aborted) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new RcloneError(method, `Unable to reach rclone: ${message}`, 0, params);
    }

    const text = await response.text();
    let body: unknown;
    try {
      body = text === '' ? {} : JSON.parse(text);
    } catch {
      body = { error: text };
    }

    if (!response.ok) {
      const errorBody = body as Partial<RcloneErrorBody>;
      throw new RcloneError(
        method,
        errorBody.error ?? `HTTP ${response.status}`,
        response.status,
        errorBody.input ?? params,
      );
    }
    return body as T;
  }

  /**
   * Run a method as an async job (`_async: true`) and wait for it to finish,
   * polling `job/status`. Aborting the signal stops the job.
   */
  async callAsync<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options: AsyncCallOptions = {},
  ): Promise<T> {
    const start = await this.call<{ jobid: number }>(
      method,
      { ...params, _async: true, ...(options.group ? { _group: options.group } : {}) },
      { signal: options.signal },
    );
    const jobid = start.jobid;

    const onAbort = () => {
      void this.call('job/stop', { jobid }).catch(() => {});
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      for (;;) {
        const status = await this.call<RcloneJobStatus>('job/status', { jobid });
        options.onPoll?.(status);
        if (status.finished) {
          if (!status.success) {
            throw new RcloneError(method, status.error || 'Job failed', 500, params);
          }
          return status.output as T;
        }
        await delay(this.jobPollInterval, options.signal);
      }
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  // --- core -------------------------------------------------------------

  version(): Promise<RcloneVersion> {
    return this.call('core/version');
  }

  noop(): Promise<unknown> {
    return this.call('rc/noop');
  }

  async listMethods(): Promise<string[]> {
    const res = await this.call<{ commands: Array<{ Path: string }> }>('rc/list');
    return res.commands.map((c) => c.Path);
  }

  stats(group?: string): Promise<RcloneStats> {
    return this.call('core/stats', group ? { group } : {});
  }

  deleteStats(group: string): Promise<unknown> {
    return this.call('core/stats-delete', { group });
  }

  quit(): Promise<unknown> {
    return this.call('core/quit');
  }

  clearFsCache(): Promise<unknown> {
    return this.call('fscache/clear');
  }

  jobStatus(jobid: number): Promise<RcloneJobStatus> {
    return this.call('job/status', { jobid });
  }

  stopJob(jobid: number): Promise<unknown> {
    return this.call('job/stop', { jobid });
  }

  stopGroup(group: string): Promise<unknown> {
    return this.call('job/stopgroup', { group });
  }

  // --- config -----------------------------------------------------------

  async listRemotes(): Promise<string[]> {
    const res = await this.call<{ remotes?: string[] }>('config/listremotes');
    return res.remotes ?? [];
  }

  getRemote(name: string): Promise<Record<string, string>> {
    return this.call('config/get', { name });
  }

  async dumpConfig(): Promise<Record<string, Record<string, string>>> {
    return this.call('config/dump');
  }

  createRemote(
    name: string,
    type: string,
    parameters: Record<string, unknown>,
    opt: RcloneConfigCreateOptions = {},
    options: CallOptions = {},
  ): Promise<unknown> {
    return this.call('config/create', { name, type, parameters, opt }, options);
  }

  /** Create a remote as an async job (needed for OAuth flows, which block until authorised). */
  createRemoteAsync(
    name: string,
    type: string,
    parameters: Record<string, unknown>,
    opt: RcloneConfigCreateOptions = {},
    options: AsyncCallOptions = {},
  ): Promise<unknown> {
    return this.callAsync('config/create', { name, type, parameters, opt }, options);
  }

  updateRemote(
    name: string,
    parameters: Record<string, unknown>,
    opt: RcloneConfigCreateOptions = {},
  ): Promise<unknown> {
    return this.call('config/update', { name, parameters, opt });
  }

  deleteRemote(name: string): Promise<unknown> {
    return this.call('config/delete', { name });
  }

  async providers(): Promise<RcloneProviderInfo[]> {
    const res = await this.call<{ providers: RcloneProviderInfo[] }>('config/providers');
    return res.providers;
  }

  setConfigPath(path: string): Promise<unknown> {
    return this.call('config/setpath', { path });
  }

  oauthStatus(): Promise<RcloneOAuthStatus> {
    return this.call('config/oauthstatus');
  }

  oauthStop(): Promise<unknown> {
    return this.call('config/oauthstop');
  }

  // --- operations -------------------------------------------------------

  async list(
    fs: string,
    remote: string,
    opt: RcloneListOptions = {},
    options: CallOptions = {},
  ): Promise<RcloneListItem[]> {
    const res = await this.call<{ list: RcloneListItem[] }>('operations/list', { fs, remote, opt }, options);
    return res.list ?? [];
  }

  async stat(
    fs: string,
    remote: string,
    opt: RcloneListOptions = {},
    options: CallOptions = {},
  ): Promise<RcloneListItem | null> {
    const res = await this.call<{ item: RcloneListItem | null }>('operations/stat', { fs, remote, opt }, options);
    return res.item ?? null;
  }

  fsInfo(fs: string, options: CallOptions = {}): Promise<RcloneFsInfo> {
    return this.call('operations/fsinfo', { fs }, options);
  }

  about(fs: string, options: CallOptions = {}): Promise<RcloneAbout> {
    return this.call('operations/about', { fs }, options);
  }

  mkdir(fs: string, remote: string, options: CallOptions = {}): Promise<unknown> {
    return this.call('operations/mkdir', { fs, remote }, options);
  }

  /** Remove an empty directory. Fails when the directory is not empty. */
  rmdir(fs: string, remote: string, options: CallOptions = {}): Promise<unknown> {
    return this.call('operations/rmdir', { fs, remote }, options);
  }

  /** Remove a directory and all of its contents. */
  purge(fs: string, remote: string, options: CallOptions = {}): Promise<unknown> {
    return this.call('operations/purge', { fs, remote }, options);
  }

  deleteFile(fs: string, remote: string, options: CallOptions = {}): Promise<unknown> {
    return this.call('operations/deletefile', { fs, remote }, options);
  }

  /**
   * Copy one file. `group` puts the transfer in a stats group so progress can
   * be read from `core/stats`. Aborting the signal cancels the transfer.
   */
  copyFile(
    srcFs: string,
    srcRemote: string,
    dstFs: string,
    dstRemote: string,
    options: CallOptions & { group?: string } = {},
  ): Promise<unknown> {
    return this.call(
      'operations/copyfile',
      { srcFs, srcRemote, dstFs, dstRemote, ...(options.group ? { _group: options.group } : {}) },
      { signal: options.signal },
    );
  }

  /** Move (rename) one file, possibly across remotes. */
  moveFile(
    srcFs: string,
    srcRemote: string,
    dstFs: string,
    dstRemote: string,
    options: CallOptions & { group?: string } = {},
  ): Promise<unknown> {
    return this.call(
      'operations/movefile',
      { srcFs, srcRemote, dstFs, dstRemote, ...(options.group ? { _group: options.group } : {}) },
      { signal: options.signal },
    );
  }

  /**
   * Hash a single file. With `download`, rclone downloads the file and hashes
   * it locally, which works even when the backend has no native hashes.
   */
  async hashFile(
    fs: string,
    remote: string,
    hashType: string,
    options: CallOptions & { download?: boolean } = {},
  ): Promise<string> {
    const res = await this.call<{ hash: string }>(
      'operations/hashsumfile',
      { fs, remote, hashType, ...(options.download ? { download: true } : {}) },
      { signal: options.signal },
    );
    return res.hash;
  }
}
