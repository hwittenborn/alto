import ignore, { type Ignore } from 'ignore';

/**
 * Name of the per-folder exclusion file, stored at the root of every synced
 * local folder. It uses `.gitignore` syntax and is itself synced, so every
 * client syncing the same remote folder shares the same exclusion rules.
 */
export const EXCLUSION_FILE_NAME = '.altoignore';

/**
 * Paths that are never synced, regardless of user rules:
 * rclone's temporary `*.partial` files that exist while a transfer is in flight.
 */
const BUILTIN_EXCLUDED = [/\.[0-9a-z]{6,}\.partial$/i];

/**
 * A compiled set of exclusion rules (gitignore semantics via the `ignore` package).
 *
 * Paths are relative to the root of the sync folder, use `/` separators and
 * have no leading slash. Excluding a folder excludes everything inside it.
 */
export class Exclusions {
  readonly patterns: readonly string[];
  private readonly matcher: Ignore;

  constructor(patterns: readonly string[] = []) {
    this.patterns = patterns.filter((p) => p.trim() !== '');
    this.matcher = ignore({ allowRelativePaths: true }).add([...this.patterns]);
  }

  static parse(text: string): Exclusions {
    return new Exclusions(parseExclusionFile(text));
  }

  /** Whether the item at `relPath` (a directory when `isDir`) is excluded. */
  isExcluded(relPath: string, isDir = false): boolean {
    if (relPath === '' || relPath === EXCLUSION_FILE_NAME) return false;
    if (BUILTIN_EXCLUDED.some((re) => re.test(relPath))) return true;
    if (this.patterns.length === 0) return false;
    return this.matcher.ignores(isDir ? `${relPath}/` : relPath);
  }
}

/** Split exclusion file text into lines (keeps comments and order). */
export function parseExclusionFile(text: string): string[] {
  if (text.trim() === '') return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Serialize exclusion patterns into file contents. */
export function serializeExclusionFile(patterns: readonly string[]): string {
  const cleaned = patterns.map((p) => p.replace(/[\r\n]/g, ''));
  return cleaned.length === 0 ? '' : `${cleaned.join('\n')}\n`;
}

/**
 * Validate a single exclusion pattern for the editor UI. Returns an error
 * message key, or null when the pattern is acceptable.
 */
export function validateExclusionPattern(pattern: string): string | null {
  if (pattern.trim() === '') return "The pattern can't be empty.";
  if (/[\r\n]/.test(pattern)) return "The pattern can't contain line breaks.";
  if (pattern !== pattern.trimStart()) return "The pattern can't start with a space.";
  if (pattern.startsWith('#')) return null; // comment line
  if (/(^|[^\\])\[(?![^\]]*\])/.test(pattern)) return "The pattern has an unclosed '['.";
  return null;
}
