/**
 * Build information for the app, generated at build time into
 * `build-info.generated.json` (next to this file), so nothing reads git at
 * runtime. Forge regenerates it on `start`, `package` and `make`, and the dev
 * server whenever the checked-out commit changes (vite.renderer.config.ts).
 *
 * A build is a nightly unless `$ALTO_RELEASE` is `1`, which only the release
 * workflow sets.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BuildInfo {
  /** The version in package.json, like `0.10.0`. */
  version: string;
  /** The short hash of the commit built, or empty outside a git checkout. */
  commit: string;
  /** Whether this is a release build (`$ALTO_RELEASE=1`), rather than a nightly. */
  release: boolean;
  /** The version shown to users: `0.10.0`, or `nightly (a1b2c3d)` for a nightly. */
  displayVersion: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
/** The repository root, which holds the app's package.json. */
const root = path.resolve(here, '../../..');
export const BUILD_INFO_FILE = path.join(here, 'build-info.generated.json');

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function currentBuildInfo(): BuildInfo {
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };
  const commit = git('rev-parse', '--short', 'HEAD');
  const release = process.env.ALTO_RELEASE === '1';
  const displayVersion = release ? version : commit ? `nightly (${commit})` : 'nightly';
  return { version, commit, release, displayVersion };
}

/** Write `build-info.generated.json`, unless it's already up to date. Returns the build information. */
export function writeBuildInfo(): BuildInfo {
  const info = currentBuildInfo();
  const contents = `${JSON.stringify(info, null, 2)}\n`;
  let existing = '';
  try {
    existing = readFileSync(BUILD_INFO_FILE, 'utf8');
  } catch {
    // Not generated yet.
  }
  if (existing !== contents) writeFileSync(BUILD_INFO_FILE, contents);
  return info;
}

/**
 * The files git changes when the checked-out commit does (a commit, pull,
 * checkout or reset), for the dev server to watch.
 */
export function gitHeadFiles(): string[] {
  const gitDir = git('rev-parse', '--absolute-git-dir');
  if (!gitDir) return [];
  const commonDir = git('rev-parse', '--path-format=absolute', '--git-common-dir') || gitDir;
  return [path.join(gitDir, 'HEAD'), path.join(commonDir, 'refs'), path.join(commonDir, 'packed-refs')];
}

// `tsx packages/node/src/build-info.ts` (npm's `prepare`, after `npm install`).
// Not plain `node`: distro builds of Node (like Ubuntu's) can't run TypeScript.
if (import.meta.main) writeBuildInfo();
