/**
 * What's on main since the last release: its commits, read from git when the
 * site is built, written up as release-please will write them into
 * CHANGELOG.md at the next release (the same sections, the same hidden
 * types). The site is rebuilt on every push to main, so this stays current.
 */
import { execFileSync } from 'node:child_process';
import { type Release, parseChangelog } from './changelog';
import { REPO_ROOT, repoFile } from './repo';
import { LINKS } from './site';

interface Config {
  packages: { '.': { 'changelog-sections': Array<{ type: string; section: string; hidden?: boolean }> } };
}

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** The commits since the last release, oldest last: [hash, subject]. */
function commits(): Array<[string, string]> | null {
  try {
    // Release-please bumps the manifest in each release's commit, and only then.
    const release = git('log', '-1', '--format=%H', '--', '.release-please-manifest.json').trim();
    if (!release) return null;
    return git('log', '--format=%H%x1f%s', `${release}..HEAD`)
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\x1f') as [string, string]);
  } catch {
    // Not in a git checkout.
    return null;
  }
}

/** The changes since the last release, or null when there are none to show. */
export function unreleased(): Release | null {
  const log = commits();
  if (!log?.length) return null;

  const config: Config = JSON.parse(repoFile('release-please-config.json'));
  const sections = config.packages['.']['changelog-sections'].filter((s) => !s.hidden);
  const changes = new Map<string, string[]>();

  for (const [hash, subject] of log) {
    const commit = subject.match(/^(\w+)(?:\(([^)]+)\))?!?: (.+)$/);
    if (!commit) continue;
    const [, type, scope, description] = commit;
    const section = sections.find((s) => s.type === type)?.section;
    if (!section) continue;
    // "fix(snap): declare … (#312)" → "**snap:** declare … ([#312](…)) ([a179606](…))"
    const pr = description!.match(/^(.*?)\s*\(#(\d+)\)$/);
    let line = `${scope ? `**${scope}:** ` : ''}${pr ? pr[1] : description}`;
    if (pr) line += ` ([#${pr[2]}](${LINKS.issues}/${pr[2]}))`;
    line += ` ([${hash.slice(0, 7)}](${LINKS.github}/commit/${hash}))`;
    changes.set(section, [...(changes.get(section) ?? []), line]);
  }
  if (!changes.size) return null;

  // In the config's order, as release-please writes them.
  const groups = [...new Set(sections.map((s) => s.section))]
    .filter((section) => changes.has(section))
    .map((section) => [`### ${section}`, ...changes.get(section)!.map((c) => `* ${c}`)].join('\n'));
  return parseChangelog(`## Unreleased\n\n${groups.join('\n\n')}\n`)[0] ?? null;
}
