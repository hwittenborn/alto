/**
 * The changelog: CHANGELOG.md from the repository (release-please writes it),
 * so the page is current with every release. Each release: its version, the
 * date under it (and a link to its release on GitHub), then its changes.
 * Above them, what's on main and not yet released (lib/unreleased.ts).
 */
import type { Metadata } from 'next';
import DocPage from '../../components/DocPage';
import { Icon } from '../../components/Icon';
import { Link } from '../../components/Link';
import { type Inline, parseChangelog } from '../../lib/changelog';
import { formatDate } from '../../lib/dates';
import { icon } from '../../lib/icons';
import { repoFile } from '../../lib/repo';
import { LINKS } from '../../lib/site';
import { unreleased } from '../../lib/unreleased';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'What changed in each release of Alto.',
  alternates: { canonical: '/changelog' },
};

const releases = parseChangelog(repoFile('CHANGELOG.md'));
const upcoming = unreleased();
const linkIcon = icon('ph:arrow-square-out');

/** A line of Markdown: its text, bold text, code and links. */
function Text({ pieces }: { pieces: Inline[] }) {
  return pieces.map((piece, i) =>
    piece.href ? (
      <Link key={i} href={piece.href}>
        {piece.text}
      </Link>
    ) : piece.code ? (
      <code key={i}>{piece.text}</code>
    ) : piece.bold ? (
      <strong key={i}>{piece.text}</strong>
    ) : (
      piece.text
    ),
  );
}

export default function ChangelogPage() {
  return (
    <DocPage title="Changelog" lede="Here's what changed in each release of Alto.">
      {[...(upcoming ? [upcoming] : []), ...releases].map((r) => (
        <section
          key={r.version}
          className="[&+&]:mt-12 [&+&]:pt-10 [&+&]:[border-top:1px_solid_var(--line)]"
          id={r === upcoming ? 'unreleased' : `v${r.version}`}
        >
          <header className="mb-[18px]">
            {r === upcoming ? (
              <>
                <h2 className="text-[1.8rem] m-0">Unreleased</h2>
                <p className="text-muted text-[0.95rem] mt-1 mb-0 mx-0">Coming in the next release.</p>
              </>
            ) : (
              <>
                <h2 className="text-[1.8rem] m-0 flex items-center gap-[0.35em]">
                  {r.version}
                  <Link
                    className="flex text-[0.6em] text-muted opacity-70 transition-opacity duration-150 ease-out hover:opacity-100 focus-visible:opacity-100"
                    href={`${LINKS.github}/releases/tag/v${r.version}`}
                    aria-label={`Alto ${r.version} on GitHub`}
                  >
                    <Icon svg={linkIcon} />
                  </Link>
                </h2>
                {r.date && (
                  <p className="text-muted text-[0.95rem] mt-1 mb-0 mx-0">
                    <time dateTime={r.date}>{formatDate(r.date)}</time>
                  </p>
                )}
              </>
            )}
          </header>
          {r.intro.map((p, i) => (
            <p key={i}>
              <Text pieces={p} />
            </p>
          ))}
          {r.groups.map((g) => (
            <div key={g.title}>
              <h3 className="text-muted text-[0.9rem] mt-[22px] mb-1.5 mx-0">{g.title}</h3>
              <ul>
                {g.changes.map((c, i) => (
                  <li key={i}>
                    <Text pieces={c.text} />
                    {c.refs.length > 0 && (
                      <span className="ml-2 text-[0.8rem] whitespace-nowrap [&_a]:text-muted [&_a+a]:ml-1.5">
                        <Text pieces={c.refs} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </DocPage>
  );
}
