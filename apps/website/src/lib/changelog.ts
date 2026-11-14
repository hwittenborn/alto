/**
 * CHANGELOG.md, read into releases for the changelog page: each one's
 * version, date, any intro paragraphs, and its groups of changes.
 *
 * The file is release-please's ("## [0.12.0](compare-url) (2026-11-14)",
 * "### Added", "* change ([#306](url)) ([56a2992](url))"), with an older,
 * hand-written entry in the same shape ("- change").
 */

export interface Change {
  /** The change, as HTML. */
  html: string;
  /** Its issue and commit links, as HTML, shown apart from it. */
  refs: string[];
}

export interface Release {
  version: string;
  /** YYYY-MM-DD. */
  date: string | null;
  /** Paragraphs before its groups, as HTML. */
  intro: string[];
  groups: Array<{ title: string; changes: Change[] }>;
}

import { isExternal } from './providers';

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Markdown's inline code and links, in already-escaped text. */
function inline(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, text: string, href: string) =>
        `<a href="${href}"${isExternal(href) ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`,
    );
}

/** A change, with its trailing "([#306](url)) ([56a2992](url))" links taken apart from it. */
function change(text: string): Change {
  const refs: string[] = [];
  let rest = text.trim();
  for (;;) {
    const match = rest.match(/\s*\((\[[^\]]+\]\([^)]+\))\)\s*$/);
    if (!match) break;
    refs.unshift(inline(match[1]!));
    rest = rest.slice(0, match.index).trimEnd();
  }
  // Release-please writes changes from commit subjects, in lower case (those
  // are the ones with links after them); hand-written ones stay as written.
  if (refs.length) rest = rest.charAt(0).toUpperCase() + rest.slice(1);
  return { html: inline(rest), refs };
}

export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  let release: Release | null = null;
  let group: Release['groups'][number] | null = null;
  let paragraph: string[] = [];

  const endParagraph = () => {
    if (release && paragraph.length) release.intro.push(inline(paragraph.join(' ')));
    paragraph = [];
  };

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^## (?:\[([^\]]+)\]\(([^)]+)\)|(\S+))(?:\s+\((\d{4}-\d{2}-\d{2})\))?/);
    if (heading) {
      endParagraph();
      release = {
        version: heading[1] ?? heading[3]!,
        date: heading[4] ?? null,
        intro: [],
        groups: [],
      };
      group = null;
      releases.push(release);
      continue;
    }
    if (!release) continue;
    const subheading = line.match(/^### (.+)/);
    if (subheading) {
      endParagraph();
      group = { title: subheading[1]!.trim(), changes: [] };
      release.groups.push(group);
      continue;
    }
    const item = line.match(/^[*-] (.+)/);
    if (item) {
      endParagraph();
      if (!group) {
        group = { title: 'Changes', changes: [] };
        release.groups.push(group);
      }
      group.changes.push(change(item[1]!));
      continue;
    }
    if (line.trim() === '') endParagraph();
    else if (!group) paragraph.push(line.trim());
  }
  endParagraph();
  return releases;
}

/** "November 14, 2026", from a date or YYYY-MM-DD, in UTC whatever the build machine's time zone. */
export function formatDate(date: Date | string): string {
  const day = typeof date === 'string' ? new Date(`${date}T00:00:00Z`) : date;
  return day.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
