import { createHash } from 'node:crypto';
import { access, chmod, constants, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import extract from 'extract-zip';

/** The rclone release Alto runs. Alto installs it on start when it has another one (or none). */
export const RCLONE_VERSION = 'v1.75.2';

const ARCHES: Partial<Record<NodeJS.Architecture, string>> = {
  x64: 'amd64',
  arm64: 'arm64',
  arm: 'arm-v7',
  ia32: '386',
};

export interface RcloneInstallProgress {
  /** Bytes of the download received so far. */
  received: number;
  /** Size of the download, when the server tells. */
  total: number | null;
}

export interface RcloneInstallOptions {
  /** Directory for the binary (`rclone`) and the release it is (`VERSION`). */
  dir: string;
  /** Default: `RCLONE_VERSION`. */
  version?: string;
  /** Default: this machine's. */
  arch?: NodeJS.Architecture;
  /** Downloads with this `fetch`: Electron's `net.fetch` uses the system's proxy settings. */
  fetch?: typeof fetch;
  /** Where releases are downloaded from. Default: rclone's GitHub releases. */
  baseUrl?: string;
  onProgress?(progress: RcloneInstallProgress): void;
}

/** rclone's name for a release's archive, e.g. `rclone-v1.75.2-linux-amd64`. */
export function rcloneRelease(version = RCLONE_VERSION, arch: NodeJS.Architecture = process.arch): string {
  const name = ARCHES[arch];
  if (!name) throw new Error(`rclone isn't available for this computer's architecture (${arch}).`);
  return `rclone-${version}-linux-${name}`;
}

const binaryIn = (dir: string) => path.join(dir, 'rclone');
const stampIn = (dir: string) => path.join(dir, 'VERSION');

/** The rclone binary in `dir`, of any release, or null. */
export async function rcloneBinary(dir: string): Promise<string | null> {
  const binary = binaryIn(dir);
  return access(binary, constants.X_OK).then(
    () => binary,
    () => null,
  );
}

/** The rclone binary in `dir` when it's the wanted release, or null. */
export async function installedRclone(
  options: Omit<RcloneInstallOptions, 'fetch' | 'onProgress'>,
): Promise<string | null> {
  const release = rcloneRelease(options.version, options.arch);
  const stamp = await readFile(stampIn(options.dir), 'utf8').catch(() => '');
  return stamp.trim() === release ? rcloneBinary(options.dir) : null;
}

async function download(
  fetchFn: typeof fetch,
  url: string,
  onProgress?: (progress: RcloneInstallProgress) => void,
): Promise<Buffer> {
  const response = await fetchFn(url);
  if (!response.ok || !response.body)
    throw new Error(`Downloading ${url} failed: ${response.status} ${response.statusText}`);
  const total = Number(response.headers.get('content-length')) || null;
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.({ received, total });
  }
  return Buffer.concat(chunks);
}

/**
 * Install an rclone release in `dir`, replacing the one there. The archive is
 * checked against the release's SHA256SUMS, and the binary swapped in only
 * once it's complete, so a failed or interrupted install leaves the old one.
 * Returns the binary.
 */
export async function installRclone(options: RcloneInstallOptions): Promise<string> {
  const { dir, onProgress } = options;
  const fetchFn = options.fetch ?? fetch;
  const version = options.version ?? RCLONE_VERSION;
  const release = rcloneRelease(version, options.arch);
  const base = options.baseUrl ?? `https://github.com/rclone/rclone/releases/download/${version}`;

  const sums = (await download(fetchFn, `${base}/SHA256SUMS`)).toString('utf8');
  const expected = sums
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find(([, file]) => file === `${release}.zip`)?.[0];
  if (!expected) throw new Error(`${release}.zip isn't listed in the release's checksums.`);

  const archive = await download(fetchFn, `${base}/${release}.zip`, onProgress);
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== expected.toLowerCase())
    throw new Error(`The download of ${release}.zip is damaged (its checksum doesn't match).`);

  // Unpacked next to the binary, so moving it in place is a rename.
  await mkdir(dir, { recursive: true });
  const work = await mkdtemp(path.join(dir, '.install-'));
  try {
    const zip = path.join(work, `${release}.zip`);
    await writeFile(zip, archive);
    await extract(zip, { dir: work });
    const binary = path.join(work, release, 'rclone');
    await chmod(binary, 0o755);
    await rename(binary, binaryIn(dir));
    await writeFile(path.join(work, 'VERSION'), `${release}\n`);
    await rename(path.join(work, 'VERSION'), stampIn(dir));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return binaryIn(dir);
}
