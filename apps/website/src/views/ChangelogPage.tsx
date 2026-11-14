/**
 * The changelog: CHANGELOG.md from the repository (release-please writes it),
 * so the page is current with every release. Each release: its version, the
 * date under it (and a link to its release on GitHub), then its changes.
 */
import linkIcon from '~icons/ph/arrow-square-out?raw';
import changelog from '../../../../CHANGELOG.md?raw';
import DocPage from '../components/DocPage';
import { Icon } from '../components/Icon';
import { Link } from '../components/Link';
import { formatDate, parseChangelog } from '../lib/changelog';
import { LINKS } from '../lib/providers';
import styles from './ChangelogPage.module.css';

const releases = parseChangelog(changelog);

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
