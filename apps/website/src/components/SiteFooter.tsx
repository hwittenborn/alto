import { LINKS } from '../lib/site';
import { Link } from './Link';
import styles from './SiteFooter.module.css';

/** This year, as of the build. */
const year = new Date().getFullYear();

export default function SiteFooter() {
  return (
    <footer className={`wrap ${styles.footer}`}>
      <span>© {year} Hunter Wittenborn</span>
      <nav className={styles.nav}>
        <a className="quiet-link" href={LINKS.privacy}>
          Privacy
        </a>
        <a className="quiet-link" href={LINKS.changelog}>
          Changelog
        </a>
        <Link className="quiet-link" href={LINKS.github}>
          Source
        </Link>
        <Link className="quiet-link" href={LINKS.issues}>
          Report an issue
        </Link>
      </nav>
    </footer>
  );
}
