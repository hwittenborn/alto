/**
 * Path helpers shared by the engine and UIs.
 *
 * Conventions used throughout Alto:
 * - Local paths are absolute POSIX paths with no trailing slash (`/home/me/Documents`).
 * - Remote paths are relative to the remote root, with no leading or trailing
 *   slash (`Documents/Work`). The remote root itself is the empty string.
 * - Paths *inside* a sync directory ("relative paths") use `/` separators and
 *   never start or end with a slash.
 */

/** Strip any leading and trailing slashes. */
export function stripSlashes(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Collapse repeated slashes and remove `.` segments. Does not resolve `..`. */
export function cleanPath(path: string): string {
  const absolute = path.startsWith('/');
  const parts = path.split('/').filter((p) => p !== '' && p !== '.');
  return (absolute ? '/' : '') + parts.join('/');
}

/** Normalize a local path: absolute, no trailing slash. */
export function normalizeLocalPath(path: string): string {
  const cleaned = cleanPath(path.trim());
  if (cleaned === '') return '/';
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

/** Normalize a remote path: no leading/trailing slash, collapsed separators. */
export function normalizeRemotePath(path: string): string {
  return stripSlashes(cleanPath(path.trim()));
}

/** Join path segments with `/`, ignoring empty segments. */
export function joinPath(...parts: string[]): string {
  const joined = parts.filter((p) => p !== '').join('/');
  return cleanPath(joined);
}

/** Parent of a relative path (`a/b/c` → `a/b`, `a` → ``). */
export function parentPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

/** Last component of a path. */
export function baseName(path: string): string {
  const stripped = path.replace(/\/+$/, '');
  const idx = stripped.lastIndexOf('/');
  return idx === -1 ? stripped : stripped.slice(idx + 1);
}

/** Every ancestor of a relative path, nearest first (`a/b/c` → [`a/b`, `a`]). */
export function ancestors(path: string): string[] {
  const out: string[] = [];
  let current = parentPath(path);
  while (current !== '') {
    out.push(current);
    current = parentPath(current);
  }
  return out;
}

/** Whether `path` is `ancestor` or lives somewhere below it. */
export function isWithin(path: string, ancestor: string): boolean {
  if (ancestor === '') return true;
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

/** Depth of a relative path (`a` → 1, `a/b` → 2). */
export function depth(path: string): number {
  return path === '' ? 0 : path.split('/').length;
}

/** Replace the user's home directory prefix with `~` for display. */
export function formatLocalPath(path: string, homeDir?: string): string {
  if (!homeDir) return path;
  const home = homeDir.replace(/\/+$/, '');
  if (path === home) return '~';
  if (path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
  return path;
}

/** Expand a leading `~` to the user's home directory. */
export function expandHome(path: string, homeDir?: string): string {
  if (!homeDir) return path;
  if (path === '~') return homeDir;
  if (path.startsWith('~/')) return joinPath(homeDir, path.slice(2));
  return path;
}

/** Format a remote path for display (always starts with `/`). */
export function formatRemotePath(path: string): string {
  return `/${stripSlashes(path)}`;
}

/** Split a file name into stem and extension (`a.tar.gz` → [`a.tar`, `.gz`]). */
export function splitExtension(name: string): [string, string] {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return [name, ''];
  return [name.slice(0, idx), name.slice(idx)];
}
