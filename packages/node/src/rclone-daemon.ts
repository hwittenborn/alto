import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname } from 'node:path';
import { RcloneClient } from '@alto/core';

export interface RcloneDaemonOptions {
  /** Path to the rclone binary. Default: `rclone` from PATH. */
  binary?: string;
  /** rclone.conf to use. */
  configPath: string;
  /** Cache directory for rclone. */
  cacheDir?: string;
  /** File to append rclone's log output to. */
  logFile?: string;
  /** Extra command line flags. */
  extraArgs?: string[];
  /** Extra environment variables for the rclone process. */
  env?: Record<string, string>;
  /** How long to wait for the rc server to come up, in ms. Default 15 s. */
  startTimeout?: number;
  /**
   * Where to record the daemon's pid. A daemon left behind by a previous run
   * that crashed (rclone doesn't notice its parent dying) is stopped on start.
   */
  pidFile?: string;
  /** Fixed port/credentials (e.g. to restart a crashed daemon behind the same client). */
  port?: number;
  user?: string;
  pass?: string;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** Stop an rclone daemon recorded in `pidFile` that still uses `configPath`. */
function killStaleDaemon(pidFile: string, configPath: string): void {
  let pid: number;
  try {
    pid = Number.parseInt(readFileSync(pidFile, 'utf8'), 10);
  } catch {
    return;
  }
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    // Only kill the process if it's really our daemon and not a recycled pid.
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
    if (cmdline.includes('rcd') && cmdline.includes(`--config=${configPath}`)) {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    // Not running anymore (or not inspectable).
  }
}

/**
 * A private `rclone rcd` instance, listening on a random localhost port and
 * protected by random credentials, that lives as long as the app.
 */
export class RcloneDaemon {
  readonly client: RcloneClient;
  readonly url: string;
  private readonly process: ChildProcess;
  private exited = false;
  private readonly exitListeners = new Set<(code: number | null) => void>();

  readonly port: number;
  readonly user: string;
  readonly pass: string;

  private constructor(
    process: ChildProcess,
    url: string,
    client: RcloneClient,
    creds: { port: number; user: string; pass: string },
  ) {
    this.process = process;
    this.url = url;
    this.client = client;
    this.port = creds.port;
    this.user = creds.user;
    this.pass = creds.pass;
    process.once('exit', (code) => {
      this.exited = true;
      for (const listener of this.exitListeners) listener(code);
    });
  }

  static async start(options: RcloneDaemonOptions): Promise<RcloneDaemon> {
    const port = options.port ?? (await freePort());
    const user = options.user ?? 'alto';
    const pass = options.pass ?? randomBytes(24).toString('hex');
    const url = `http://127.0.0.1:${port}/`;
    mkdirSync(dirname(options.configPath), { recursive: true });
    if (options.pidFile) killStaleDaemon(options.pidFile, options.configPath);

    const args = [
      'rcd',
      `--rc-addr=127.0.0.1:${port}`,
      `--rc-user=${user}`,
      `--rc-pass=${pass}`,
      `--config=${options.configPath}`,
      // Finished async jobs (e.g. OAuth logins) must stay queryable for a while.
      '--rc-job-expire-duration=10m',
      '--use-json-log',
      '--log-level=NOTICE',
      ...(options.cacheDir ? [`--cache-dir=${options.cacheDir}`] : []),
      ...(options.extraArgs ?? []),
    ];

    const child = spawn(options.binary ?? 'rclone', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env, RCLONE_PASSWORD_COMMAND: '' },
    });

    const { pidFile } = options;
    if (pidFile && child.pid) {
      mkdirSync(dirname(pidFile), { recursive: true });
      writeFileSync(pidFile, String(child.pid));
      child.once('exit', () => rmSync(pidFile, { force: true }));
    }

    let output = '';
    const collect = (chunk: Buffer) => {
      if (output.length < 16_384) output += chunk.toString();
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    if (options.logFile) {
      mkdirSync(dirname(options.logFile), { recursive: true });
      const log = createWriteStream(options.logFile, { flags: 'a' });
      child.stdout?.pipe(log);
      child.stderr?.pipe(log);
    }

    const client = new RcloneClient({ url, user, pass });
    const daemon = new RcloneDaemon(child, url, client, { port, user, pass });

    const spawnError = new Promise<never>((_, reject) => {
      child.once('error', (err) => reject(new Error(`Unable to start rclone: ${err.message}`)));
      child.once('exit', (code) => reject(new Error(`rclone exited during startup (code ${code}).\n${output.trim()}`)));
    });
    spawnError.catch(() => {});

    const deadline = Date.now() + (options.startTimeout ?? 15_000);
    const waitReady = (async () => {
      for (;;) {
        try {
          await client.noop();
          return;
        } catch (err) {
          if (Date.now() > deadline) throw new Error(`rclone did not start in time: ${String(err)}`);
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    })();

    await Promise.race([waitReady, spawnError]);
    return daemon;
  }

  get running(): boolean {
    return !this.exited;
  }

  onExit(listener: (code: number | null) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  /** Ask rclone to quit, killing it if it doesn't within `timeout` ms. */
  async stop(timeout = 3000): Promise<void> {
    if (this.exited) return;
    const exited = new Promise<void>((resolve) => this.process.once('exit', () => resolve()));
    await this.client.quit().catch(() => {});
    const timer = setTimeout(() => this.process.kill('SIGKILL'), timeout);
    await exited;
    clearTimeout(timer);
  }
}
