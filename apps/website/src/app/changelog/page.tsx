/**
 * The changelog: CHANGELOG.md from the repository (release-please writes it),
 * so the page is current with every release. Each release: its version, the
 * date under it (and a link to its release on GitHub), then its changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import DocPage from '../../components/DocPage';
import { Icon } from '../../components/Icon';
import { Link } from '../../components/Link';
import { formatDate, parseChangelog } from '../../lib/changelog';
import { icon } from '../../lib/icons';
import { LINKS } from '../../lib/providers';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Changelog · Alto',
  description: 'What changed in each release of Alto.',
  alternates: { canonical: '/changelog' },
};

const releases = parseChangelog(fs.readFileSync(path.resolve(process.cwd(), '../../CHANGELOG.md'), 'utf8'));
const linkIcon = icon('ph:arrow-square-out');

export default function ChangelogPage() {
  return (
    <DocPage title="Changelog" lede="Here's what changed in each release of Alto.">
      {releases.map((r) => (
        <section key={r.version} className={styles.release} id={`v${r.version}`}>
          <header className={styles.head}>
            <h2 className={styles.version}>
              {r.version}
              <Link
                className={styles.versionLink}
                href={`${LINKS.github}/releases/tag/v${r.version}`}
                aria-label={`Alto ${r.version} on GitHub`}
              >
                <Icon svg={linkIcon} />
              </Link>
            </h2>
            {r.date && (
              <p className={styles.date}>
                <time dateTime={r.date}>{formatDate(r.date)}</time>
              </p>
            )}
          </header>
          {r.intro.map((p, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: p }} />
          ))}
          {r.groups.map((g) => (
            <div key={g.title}>
              <h3 className={styles.group}>{g.title}</h3>
              <ul>
                {g.changes.map((c, i) => (
                  <li key={i}>
                    <span dangerouslySetInnerHTML={{ __html: c.html }} />
                    {c.refs.length > 0 && (
                      <span className={styles.refs} dangerouslySetInnerHTML={{ __html: c.refs.join(' ') }} />
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
