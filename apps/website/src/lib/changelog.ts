/**
 * CHANGELOG.md, read into releases for the changelog page: each one's
 * version, date, any intro paragraphs, and its groups of changes.
 *
 * The file is release-please's ("## [0.12.0](compare-url) (2026-11-14)",
 * "### Added", "* change ([#306](url)) ([56a2992](url))"), with an older,
 * hand-written entry in the same shape ("- change").
 */

/** A piece of a line of Markdown: plain text, bold text, inline code, or a link. */
export type Inline = { text: string; bold?: true; code?: true; href?: string };

export interface Change {
  text: Inline[];
  /** Its issue and commit links, shown apart from it. */
  refs: Inline[];
}

export interface Release {
  version: string;
  /** YYYY-MM-DD. */
  date: string | null;
  /** Paragraphs before its groups. */
  intro: Inline[][];
  groups: Array<{ title: string; changes: Change[] }>;
}

/** Markdown's inline code, links and bold text, and the text between them. */
function inline(text: string): Inline[] {
  const pieces: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(/`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g)) {
    if (m.index > last) pieces.push({ text: text.slice(last, m.index) });
    pieces.push(
      m[1] !== undefined
        ? { text: m[1], code: true }
        : m[4] !== undefined
          ? { text: m[4], bold: true }
          : { text: m[2]!, href: m[3]! },
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}

/** A change, with its trailing "([#306](url)) ([56a2992](url))" links taken apart from it. */
function change(text: string): Change {
  const refs: Inline[] = [];
  let rest = text.trim();
  for (;;) {
    const match = rest.match(/\s*\((\[[^\]]+\]\([^)]+\))\)\s*$/);
    if (!match) break;
    refs.unshift(...inline(match[1]!));
    rest = rest.slice(0, match.index).trimEnd();
  }
  // Release-please writes changes from commit subjects, in lower case (those
  // are the ones with links after them); hand-written ones stay as written.
  // A scope ("**snap:** declare ...") comes first, so it's the one capitalized.
  if (refs.length) rest = rest.replace(/[a-z]/, (c) => c.toUpperCase());
  return { text: inline(rest), refs };
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
