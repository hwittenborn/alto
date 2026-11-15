/**
 * The site's header. At the top of the page it spreads across the content
 * width, plain; once the page has scrolled a way down it gathers into a
 * floating frosted pill (ScrollPill), and spreads out again back at the top.
 */
import { appIconUrl } from '../lib/app-icon';
import { icon } from '../lib/icons';
import { LINKS } from '../lib/providers';
import { Icon } from './Icon';
import { Link } from './Link';
import { ScrollPill } from './ScrollPill';
import styles from './SiteHeader.module.css';

export default function SiteHeader() {
  return (
    <header className={styles.top}>
      <ScrollPill className={styles.pill}>
        <a className={styles.mark} href="/">
          <img src={appIconUrl} alt="" width="32" height="32" /> Alto
        </a>
        <nav className={styles.nav}>
          <a className={`quiet-link ${styles.changelog}`} href={LINKS.changelog}>
            Changelog
          </a>
          <Link className={`quiet-link ${styles.github}`} href={LINKS.github} aria-label="Alto on GitHub">
            <Icon svg={icon('simple-icons:github')} className={styles.githubMark} />
            <span className={styles.label}>GitHub</span>
          </Link>
          <a className="button primary small" href={LINKS.install}>
            <Icon svg={icon('ph:download-simple-bold')} />
            Install Alto
          </a>
        </nav>
      </ScrollPill>
    </header>
  );
}
