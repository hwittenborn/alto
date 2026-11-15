/**
 * Installing Alto, by operating system (marked in their logos, dimmed; the
 * packages in their own brand colors): Linux (the Snap Store, a .deb, an
 * .rpm or an AppImage; Flathub soon), then Windows, macOS, Android and iOS,
 * coming soon.
 *
 * The packages' names and links follow the version in the repository's
 * package.json (release-please sets it at each release), so the page stays
 * current with the latest release.
 */
import rootPackage from '../../../../../package.json';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { Link } from '../../components/Link';
import { icon } from '../../lib/icons';
import { LINKS } from '../../lib/providers';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Install Alto',
  description:
    'Install Alto on Linux from the Snap Store, or as a .deb, .rpm or AppImage. Flathub, Windows, macOS, Android and iOS are coming soon.',
  alternates: { canonical: '/install' },
};

const android = icon('simple-icons:android');
const apple = icon('simple-icons:apple');
const appimage = icon('simple-icons:appimage');
const debian = icon('simple-icons:debian');
const fedora = icon('simple-icons:fedora');
const flathub = icon('simple-icons:flathub');
const linux = icon('simple-icons:linux');
const linuxmint = icon('simple-icons:linuxmint');
const opensuse = icon('simple-icons:opensuse');
const redhat = icon('simple-icons:redhat');
const snapcraft = icon('simple-icons:snapcraft');
const ubuntu = icon('simple-icons:ubuntu');
const windows = icon('simple-icons:windows');
const downloadIcon = icon('ph:download-simple-bold');

const { version } = rootPackage;
const releaseFile = (file: string) => `${LINKS.github}/releases/download/v${version}/${file}`;
const files = {
  deb: `alto_${version}_amd64.deb`,
  rpm: `alto-${version}-1.x86_64.rpm`,
  appimage: `Alto-${version}-x64.AppImage`,
};

/** A distribution, with its mark in its brand color. */
interface Distro {
  name: string;
  icon: string;
  color: string;
}

interface Package {
  id: string;
  name: string;
  /** The name is a file type (.deb), set as code. */
  code?: boolean;
  /** Where it fits. */
  note?: string;
  /** The distributions it's for, each with its mark: "For Debian, Ubuntu and others." */
  distros?: Distro[];
  icon: string;
  /** The brand color behind its mark. */
  color: string;
  /** The main action, or none yet (coming soon). */
  action?: { label: string; href: string; download?: boolean };
  /** Somewhere else to get it, mentioned after the note. */
  also?: { label: string; href: string };
  recommended?: boolean;
}

/** Where Alto is coming next: a row of desktops, then a row of phones. */
const soon = [
  [
    { id: 'windows', name: 'Windows', icon: windows },
    { id: 'macos', name: 'macOS', icon: apple },
  ],
  [
    { id: 'android', name: 'Android', icon: android },
    // Apple's mark: there's no separate one for iOS.
    { id: 'ios', name: 'iOS', icon: apple },
  ],
];

const packages: Package[] = [
  {
    id: 'snap',
    name: 'Snap Store',
    note: 'Any distribution with snaps. Keeps itself up to date.',
    icon: snapcraft,
    color: '#E95420',
    action: { label: 'Open in Snap Store', href: LINKS.snapApp },
    also: { label: 'snapcraft.io', href: LINKS.snap },
    recommended: true,
  },
  {
    id: 'deb',
    name: '.deb',
    code: true,
    distros: [
      { name: 'Debian', icon: debian, color: '#A81D33' },
      { name: 'Ubuntu', icon: ubuntu, color: '#E95420' },
      { name: 'Linux Mint', icon: linuxmint, color: '#87CF3E' },
    ],
    icon: debian,
    color: '#A81D33',
    action: { label: 'Download .deb', href: releaseFile(files.deb), download: true },
  },
  {
    id: 'rpm',
    name: '.rpm',
    code: true,
    distros: [
      { name: 'Fedora', icon: fedora, color: '#51A2DA' },
      { name: 'Red Hat', icon: redhat, color: '#EE0000' },
      { name: 'openSUSE', icon: opensuse, color: '#73BA25' },
    ],
    icon: fedora,
    color: '#51A2DA',
    action: { label: 'Download .rpm', href: releaseFile(files.rpm), download: true },
  },
  {
    id: 'appimage',
    name: 'AppImage',
    note: 'One file that runs on most distributions.',
    icon: appimage,
    color: '#5C8FCB',
    action: { label: 'Download AppImage', href: releaseFile(files.appimage), download: true },
  },
  {
    id: 'flathub',
    name: 'Flathub',
    note: 'Any distribution with Flatpak.',
    icon: flathub,
    // Flathub's mark is black: the page's text color, so it shows at night too.
    color: 'var(--fg)',
  },
];

/** A CSS custom property's value, for `style`. */
const vars = (values: Record<string, string | number>) => values as CSSProperties;

function PackageRow({ p }: { p: Package }) {
  return (
    <li className={`${styles.package} ${p.action ? '' : styles.upcoming}`} id={p.id}>
      <Icon svg={p.icon} className={styles.tile} style={vars({ '--brand': p.color })} />
      <div>
        <h3 className={styles.name}>
          {p.code ? <code>{p.name}</code> : p.name}
          {p.recommended && <span className="chip">Recommended</span>}
          {!p.action && <span className="chip">Coming soon</span>}
        </h3>
        <p className={styles.note}>
          {p.distros && (
            <>
              For{' '}
              {p.distros.map((d, i) => (
                <span key={d.name}>
                  <span className={styles.distro} style={vars({ '--brand': d.color })}>
                    <Icon svg={d.icon} className={styles.distroMark} />
                    {d.name}
                  </span>
                  {i < p.distros!.length - 1 ? ', ' : ' '}
                </span>
              ))}
              and others.
            </>
          )}
          {p.note}
          {p.also && (
            <>
              {' '}
              Also on <Link href={p.also.href}>{p.also.label}</Link>.
            </>
          )}
        </p>
      </div>
      {p.action && (
        <a
          className={`button primary small ${styles.get}`}
          href={p.action.href}
          download={p.action.download ? '' : undefined}
        >
          <Icon svg={downloadIcon} />
          {p.action.label}
        </a>
      )}
    </li>
  );
}

export default function InstallPage() {
  return (
    <main className={`wrap ${styles.install}`}>
      <header className={styles.intro}>
        <h1 className={styles.title}>
          <span className="enter-line">
            <span>Install Alto</span>
          </span>
        </h1>
        <p className={`lede ${styles.lede}`} data-enter-fade="">
          Free and open source, under the GPL.
        </p>
        <a className={styles.versionChip} href={LINKS.changelog} data-enter-fade="" style={vars({ '--i': 1 })}>
          <span className={styles.version}>v{version}</span>
          See what's new
        </a>
      </header>

      <section
        className={`glass-panel ${styles.os}`}
        aria-labelledby="linux"
        data-enter-fade=""
        style={vars({ '--i': 1 })}
      >
        <div className={styles.osHead}>
          <Icon svg={linux} className={styles.osIcon} />
          <div>
            <h2 id="linux" className={styles.osName}>
              Linux
            </h2>
            <p>For 64-bit Intel and AMD computers.</p>
          </div>
        </div>
        <ul className={styles.packages}>
          {packages.map((p) => (
            <PackageRow key={p.id} p={p} />
          ))}
        </ul>
      </section>

      {soon.map((row, i) => (
        <div key={i} className={styles.soon} data-enter-fade="" style={vars({ '--i': 2 + i })}>
          {row.map((os) => (
            <section key={os.id} className={`glass-panel ${styles.os} ${styles.osSoon}`} aria-labelledby={os.id}>
              <Icon svg={os.icon} className={styles.osIcon} />
              <h2 id={os.id} className={styles.osName}>
                {os.name}
              </h2>
              <span className="chip">Coming soon</span>
            </section>
          ))}
        </div>
      ))}

      <p className={styles.source} data-enter-fade="" style={vars({ '--i': 4 })}>
        Every release, with its packages, is <Link href={`${LINKS.github}/releases`}>on GitHub</Link>. Or{' '}
        <Link href={`${LINKS.github}/blob/main/CONTRIBUTING.md`}>build it from source</Link>.
      </p>
    </main>
  );
}
