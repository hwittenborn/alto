/**
 * The site's header. At the top of the page it spreads across the content
 * width, plain; once the page has scrolled a way down it gathers into a
 * floating frosted pill, and spreads out again back at the top.
 */
import download from '~icons/ph/download-simple-bold?raw';
import github from '~icons/simple-icons/github?raw';
import { useEffect, useState } from 'react';
import { appIconUrl } from '../lib/app-icon';
import { LINKS } from '../lib/providers';
import { Icon } from './Icon';
import { Link } from './Link';
import styles from './SiteHeader.module.css';

/** Whether the page has scrolled further down than `offset` px. */
function useScrolledPast(offset: number): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const update = () => setPast(scrollY > offset);
    update();
    addEventListener('scroll', update, { passive: true });
    return () => removeEventListener('scroll', update);
  }, [offset]);
  return past;
}

export default function SiteHeader() {
  const scrolled = useScrolledPast(160);
  return (
    <header className={styles.top}>
      <div className={styles.pill} data-scrolled={scrolled || undefined}>
        <a className={styles.mark} href="/">
          <img src={appIconUrl} alt="" width="32" height="32" /> Alto
        </a>
        <nav className={styles.nav}>
          <a className={`quiet-link ${styles.changelog}`} href={LINKS.changelog}>
            Changelog
          </a>
          <Link className={`quiet-link ${styles.github}`} href={LINKS.github} aria-label="Alto on GitHub">
            <Icon svg={github} className={styles.githubMark} />
            <span className={styles.label}>GitHub</span>
          </Link>
          <a className="button primary small" href={LINKS.install}>
            <Icon svg={download} />
            Install Alto
          </a>
        </nav>
      </div>
    </header>
  );
}
