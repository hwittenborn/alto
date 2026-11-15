/**
 * The homepage: the words centered over Alto, live in the page (DemoStage),
 * which stands in a soft pastel glow; then three reasons for Alto, and the
 * install band.
 */
import type { Metadata } from 'next';
import DemoStage from '../demo/DemoStage';
import { appIconSvg } from '../lib/app-icon';
import { Icon } from '../components/Icon';
import { Link } from '../components/Link';
import { cssVars } from '../lib/css';
import { downloadIcon, providerLogos } from '../lib/icons';
import { LINKS } from '../lib/site';
import styles from './page.module.css';

export const metadata: Metadata = { alternates: { canonical: '/' } };

const order = (i: number) => cssVars({ '--i': i });

/** A reason's mark: a line drawing, in the accent color. */
function Mark({ path }: { path: string }) {
  return (
    <span className={styles.mark} aria-hidden="true">
      <svg viewBox="0 0 16 16">
        <path d={path} />
      </svg>
    </span>
  );
}

export default function HomePage() {
  return (
    <main>
      <section className={`wrap ${styles.hero}`}>
        <div className={styles.words}>
          <h1 className={styles.title}>
            <span className="enter-line" style={order(0)}>
              <span>All of your cloud storage,</span>
            </span>
            <span className="enter-line" style={order(1)}>
              <span>synced to your computer</span>
            </span>
          </h1>
          <p className={`lede ${styles.lede}`} data-enter-fade="" style={order(0)}>
            Alto keeps folders on your computer in two-way sync with Google Drive, Dropbox, OneDrive, Proton Drive,
            Nextcloud and more.
          </p>
          <div className={styles.cta} data-enter-fade="" style={order(1)}>
            <a className="button primary" href={LINKS.install}>
              <Icon svg={downloadIcon()} /> Install Alto
            </a>
          </div>
        </div>
        <div className={styles.pedestal}>
          <DemoStage height="min(620px, 72vh)" assets={{ logos: providerLogos(), appIcon: appIconSvg() }} />
        </div>
      </section>

      <section className="wrap" aria-labelledby="points-title">
        <h2 id="points-title" className="visually-hidden">
          Why Alto
        </h2>
        <ul className={`glass-panel ${styles.list}`}>
          <li>
            <Mark path="M3 2.75h10c.69 0 1.25.56 1.25 1.25v8c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25V4c0-.69.56-1.25 1.25-1.25zM1.75 6h12.5" />
            <h3 className={styles.point}>Native on your desktop</h3>
            <p>Made to look and feel at home on your desktop.</p>
          </li>
          <li>
            <Mark path="M8 1.75 2.75 3.75v4c0 3.1 2.2 5.5 5.25 6.5 3.05-1 5.25-3.4 5.25-6.5v-4zM5.75 8l1.6 1.6 2.9-3.1" />
            <h3 className={styles.point}>No tracking</h3>
            <p>
              There's no Alto account to make, and nothing about you is collected. Your sign-ins stay on your computer.
            </p>
          </li>
          <li>
            <Mark path="M5.25 4.5 1.75 8l3.5 3.5M10.75 4.5 14.25 8l-3.5 3.5" />
            <h3 className={styles.point}>Open source</h3>
            <p>
              Free under the GPL, with every line public. Find it <Link href={LINKS.github}>on GitHub</Link>.
            </p>
          </li>
        </ul>
      </section>

      <section className={`wrap ${styles.close}`}>
        <div className={styles.band}>
          <h2 className={styles.bandTitle}>Get Alto</h2>
          <p>Free and open source. Out now for Linux, with more platforms on the way.</p>
          <a className="button primary" href={LINKS.install}>
            Install Alto
          </a>
        </div>
      </section>
    </main>
  );
}
