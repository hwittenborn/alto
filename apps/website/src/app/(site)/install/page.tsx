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
import rootPackage from '../../../../../../package.json';
import type { Metadata } from 'next';
import { Icon } from '../../../components/Icon';
import { Link } from '../../../components/Link';
import { cssVars } from '../../../lib/css';
import { downloadIcon, icon } from '../../../lib/icons';
import { LINKS } from '../../../lib/site';

export const metadata: Metadata = {
  title: { absolute: 'Install Alto' },
  description:
    'Install Alto on Linux from the Snap Store, or as a .deb, .rpm or AppImage. Flathub, Windows, macOS, Android and iOS are coming soon.',
  alternates: { canonical: '/install' },
};

/** Marks used more than once. */
const apple = icon('simple-icons:apple');
const debian = icon('simple-icons:debian');
const fedora = icon('simple-icons:fedora');

const { version } = rootPackage;
const releaseFile = (file: string) => `${LINKS.github}/releases/download/v${version}/${file}`;

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
    { id: 'windows', name: 'Windows', icon: icon('simple-icons:windows') },
    { id: 'macos', name: 'macOS', icon: apple },
  ],
  [
    { id: 'android', name: 'Android', icon: icon('simple-icons:android') },
    // Apple's mark: there's no separate one for iOS.
    { id: 'ios', name: 'iOS', icon: apple },
  ],
];

const packages: Package[] = [
  {
    id: 'snap',
    name: 'Snap Store',
    note: 'Any distribution with snaps. Keeps itself up to date.',
    icon: icon('simple-icons:snapcraft'),
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
      { name: 'Ubuntu', icon: icon('simple-icons:ubuntu'), color: '#E95420' },
      { name: 'Linux Mint', icon: icon('simple-icons:linuxmint'), color: '#87CF3E' },
    ],
    icon: debian,
    color: '#A81D33',
    action: { label: 'Download .deb', href: releaseFile(`alto_${version}_amd64.deb`), download: true },
  },
  {
    id: 'rpm',
    name: '.rpm',
    code: true,
    distros: [
      { name: 'Fedora', icon: fedora, color: '#51A2DA' },
      { name: 'Red Hat', icon: icon('simple-icons:redhat'), color: '#EE0000' },
      { name: 'openSUSE', icon: icon('simple-icons:opensuse'), color: '#73BA25' },
    ],
    icon: fedora,
    color: '#51A2DA',
    action: { label: 'Download .rpm', href: releaseFile(`alto-${version}-1.x86_64.rpm`), download: true },
  },
  {
    id: 'appimage',
    name: 'AppImage',
    note: 'One file that runs on most distributions.',
    icon: icon('simple-icons:appimage'),
    color: '#5C8FCB',
    action: { label: 'Download AppImage', href: releaseFile(`Alto-${version}-x64.AppImage`), download: true },
  },
  {
    id: 'flathub',
    name: 'Flathub',
    note: 'Any distribution with Flatpak.',
    icon: icon('simple-icons:flathub'),
    // Flathub's mark is black: the page's text color, so it shows at night too.
    color: 'var(--fg)',
  },
];

function PackageRow({ p }: { p: Package }) {
  return (
    <li
      className={`grid grid-cols-[36px_minmax(0,1fr)_196px] items-center gap-[18px] py-4 [&+&]:[border-top:1px_solid_var(--line)] max-[560px]:grid-cols-[36px_minmax(0,1fr)] max-[560px]:gap-x-3.5 max-[560px]:gap-y-3 ${p.action ? '' : '[&_.tile]:opacity-55'}`}
      id={p.id}
    >
      <Icon
        svg={p.icon}
        className="tile grid place-items-center size-[1.875em] rounded-[10px] text-[1.2em] text-(--brand) bg-[color-mix(in_srgb,var(--brand)_14%,transparent)]"
        style={cssVars({ '--brand': p.color })}
      />
      <div>
        <h3 className="flex items-center gap-2 text-[1.05rem] font-medium m-0 [&_code]:text-[0.92em] [&_code]:py-px [&_code]:px-[7px] [&_code]:rounded-md [&_code]:bg-bg [&_code]:shadow-[inset_0_0_0_1px_var(--line)]">
          {p.code ? <code>{p.name}</code> : p.name}
          {p.recommended && <span className="chip">Recommended</span>}
          {!p.action && <span className="chip">Coming soon</span>}
        </h3>
        <p className="text-muted text-[0.9rem] leading-[1.45] mt-[3px] mb-0 mx-0">
          {p.distros && (
            <>
              For{' '}
              {p.distros.map((d, i) => (
                <span key={d.name}>
                  <span className="whitespace-nowrap" style={cssVars({ '--brand': d.color })}>
                    <Icon svg={d.icon} className="align-[-0.15em] mr-[0.3em] ml-[0.25em] text-(--brand)" />
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
          className={`button primary small w-full whitespace-nowrap max-[560px]:col-span-full`}
          href={p.action.href}
          download={p.action.download ? '' : undefined}
        >
          <Icon svg={downloadIcon()} />
          {p.action.label}
        </a>
      )}
    </li>
  );
}

export default function InstallPage() {
  return (
    <main className={`wrap pt-12 pb-10`}>
      <header className="text-center mb-12">
        <h1 className="text-[clamp(2.4rem,5.4vw,3.8rem)] leading-[1.04]">
          <span className="enter-line">
            <span>Install Alto</span>
          </span>
        </h1>
        <p className={`lede text-[1.1rem] mt-4 mb-0 mx-0`} data-enter-fade="">
          Free and open source, under the GPL.
        </p>
        <a
          className="mt-[18px] inline-flex items-center gap-2 py-[5px] pr-3 pl-[5px] rounded-full text-[0.85rem] font-medium no-underline text-accent bg-[color-mix(in_srgb,var(--accent-ink)_10%,transparent)] whitespace-nowrap transition-[background-color] duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--accent-ink)_16%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--accent-ink)_16%,transparent)]"
          href={LINKS.changelog}
          data-enter-fade=""
          style={cssVars({ '--i': 1 })}
        >
          <span className="px-2 py-0.5 rounded-full text-fg bg-card shadow-[inset_0_0_0_1px_var(--line)] tabular-nums">
            v{version}
          </span>
          See what's new
        </a>
      </header>

      <section
        className={`glass-panel rounded-3xl tabular-nums`}
        aria-labelledby="linux"
        data-enter-fade=""
        style={cssVars({ '--i': 1 })}
      >
        <div className="flex flex-wrap items-center gap-3.5 pt-[26px] px-7 pb-0 max-[720px]:pt-[22px] max-[720px]:px-4 [&_p]:text-muted [&_p]:text-[0.92rem] [&_p]:mt-0.5 [&_p]:mb-0 [&_p]:mx-0">
          <Icon svg={icon('simple-icons:linux')} className="text-[1.875em] text-fg opacity-55" />
          <div>
            <h2 id="linux" className="text-[1.5rem] font-medium tracking-[-0.03em] m-0">
              Linux
            </h2>
            <p>For 64-bit Intel and AMD computers.</p>
          </div>
        </div>
        <ul className="list-none m-0 pt-3 px-7 pb-3.5 max-[720px]:pt-2 max-[720px]:px-4 max-[720px]:pb-2.5">
          {packages.map((p) => (
            <PackageRow key={p.id} p={p} />
          ))}
        </ul>
      </section>

      {soon.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-2 gap-3.5 mt-3.5 max-[560px]:grid-cols-1"
          data-enter-fade=""
          style={cssVars({ '--i': 2 + i })}
        >
          {row.map((os) => (
            <section
              key={os.id}
              className={`glass-panel rounded-3xl tabular-nums flex items-center gap-3 py-5 px-[22px] max-[720px]:py-[18px] max-[720px]:px-4 [&_.chip]:ml-auto [&_.chip]:flex-none [&_.icon]:text-[1.625em] [&_h2]:text-[1.25rem] [&_h2]:text-muted`}
              aria-labelledby={os.id}
            >
              <Icon svg={os.icon} className="text-[1.875em] text-fg opacity-55" />
              <h2 id={os.id} className="text-[1.5rem] font-medium tracking-[-0.03em] m-0">
                {os.name}
              </h2>
              <span className="chip">Coming soon</span>
            </section>
          ))}
        </div>
      ))}

      <p
        className="text-muted text-center text-[0.92rem] mt-9 mb-0 mx-0"
        data-enter-fade=""
        style={cssVars({ '--i': 4 })}
      >
        Every release, with its packages, is <Link href={`${LINKS.github}/releases`}>on GitHub</Link>. Or{' '}
        <Link href={`${LINKS.github}/blob/main/CONTRIBUTING.md`}>build it from source</Link>.
      </p>
    </main>
  );
}
