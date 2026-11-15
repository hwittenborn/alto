/**
 * Files elsewhere in the repository, read when the site is built: the
 * changelog, the app's icon. (The build runs in apps/website.)
 */
import fs from 'node:fs';
import path from 'node:path';

export const REPO_ROOT = path.resolve(process.cwd(), '../..');

/** A file's text, by its path from the repository's root. */
export const repoFile = (relative: string) => fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
