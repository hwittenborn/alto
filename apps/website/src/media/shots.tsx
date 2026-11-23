// Every picture of Alto the site makes. Each renders at /media/shot/<id> and is captured as /media/<id>.png.
import { PROVIDERS } from '@alto/core';
import type { CSSProperties, ReactNode } from 'react';
import { appIconUrl } from '../lib/app-icon';
import { allProviderLogos } from '../lib/icons';
import { isLightTile, type SiteProviderId } from '../lib/providers';
import { mediaAssets } from './assets';
import MediaWindow from './MediaWindowLoader';

export const SLOGAN = 'Sync all of your cloud storage in one place';

export interface Shot {
  id: string;
  use: string;
  /** CSS pixels; the PNG is `width * scale` by `height * scale`. */
  width: number;
  height: number;
  scale: number;
  colorScheme: 'light' | 'dark';
  maxBytes?: number;
  noWindow?: boolean;
  body: () => ReactNode;
}

type Box = { x: number; y: number; w: number; h: number };

function Win({
  box,
  scheme,
  account,
  folder,
  conflict,
  fade,
  framed,
}: {
  box: Box;
  scheme?: 'light' | 'dark';
  account?: SiteProviderId;
  folder?: boolean;
  conflict?: boolean;
  /** Fades out at the bottom, where the picture cuts it. */
  fade?: boolean;
  /** In an iframe, so it can differ in theme from the page. */
  framed?: boolean;
}) {
  return (
    <div className={`shot-win${fade ? ' fade' : ''}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      {framed ? (
        <iframe
          title=""
          src={`/media/frame?scheme=${scheme ?? 'light'}&account=${account ?? 'gdrive'}`}
          style={{ width: '100%', height: '100%', border: 0, colorScheme: scheme ?? 'light' }}
        />
      ) : (
        <MediaWindow
          assets={mediaAssets()}
          colorScheme={scheme}
          account={account}
          folder={folder}
          conflict={conflict}
        />
      )}
    </div>
  );
}

function Brand({ small, style }: { small?: boolean; style?: CSSProperties }) {
  return (
    <div className={`shot-brand${small ? ' small' : ''}`} style={style}>
      <img src={appIconUrl} alt="" />
      <h1>Alto</h1>
      <p>{SLOGAN}</p>
    </div>
  );
}

function Head({ title, sub, left, style }: { title: string; sub: string; left?: boolean; style?: CSSProperties }) {
  return (
    <div className={`shot-head ${left ? 'left' : 'center'}`} style={style}>
      <h2>{title}</h2>
      <p>{sub}</p>
    </div>
  );
}

/** [id, left, top] */
function Chips({ at }: { at: Array<[string, number, number]> }) {
  const logos = allProviderLogos();
  return (
    <>
      {at.map(([id, x, y]) => {
        const def = PROVIDERS.find((p) => p.id === id);
        if (!def) throw new Error(`No provider ${id}`);
        return (
          <span key={id} className="shot-chip" style={{ left: x, top: y }}>
            <span
              className={`mark${isLightTile(def) ? ' light' : ''}`}
              style={{ background: `#${def.color}` }}
              dangerouslySetInnerHTML={{ __html: logos[def.id] }}
            />
            {def.label}
          </span>
        );
      })}
    </>
  );
}

const Ground = ({ kind, grain }: { kind: 'halo' | 'mist' | 'field'; grain?: boolean }) => (
  <div className={`ground g-${kind}${grain ? ' grain' : ''}`} />
);

function preview({ width, height }: { width: number; height: number }): ReactNode {
  const small = width < 1280;
  return (
    <>
      <Ground kind="field" grain />
      <Brand small={small} style={{ left: 64, top: 0, bottom: 0, width: small ? 300 : 340 }} />
      <Win box={{ x: width - 48 - 760, y: 60, w: 760, h: height - 120 }} folder />
    </>
  );
}

const SNAP_MAX = 2 * 1024 * 1024;
// 1920×640
const BANNER = { width: 1280, height: 640 / 1.5, scale: 1.5, maxBytes: SNAP_MAX };
// 1920×1080
const SCREENSHOT = { width: 1536, height: 864, scale: 1.25, maxBytes: SNAP_MAX };

export const SHOTS: Shot[] = [
  {
    id: 'snap-banner',
    use: 'the Snap Store banner',
    ...BANNER,
    colorScheme: 'light',
    body: () => (
      <>
        <Ground kind="mist" grain />
        <Brand style={{ left: 64, top: 0, bottom: 0, width: 340 }} />
        <Win box={{ x: 440, y: 64, w: 800, h: BANNER.height - 64 + 120 }} fade />
      </>
    ),
  },
  {
    id: 'snap-screenshot-1',
    use: 'Snap Store screenshot 1',
    ...SCREENSHOT,
    colorScheme: 'light',
    body: () => (
      <>
        <Ground kind="halo" grain />
        <Head
          left
          title="Your cloud storage, in sync with your computer"
          sub="Change a file on your computer or in the cloud, and Alto keeps the other up to date."
          style={{ left: 80, top: 0, bottom: 0, width: 500 }}
        />
        <Win box={{ x: 628, y: 172, w: 860, h: 520 }} />
      </>
    ),
  },
  {
    id: 'snap-screenshot-2',
    use: 'Snap Store screenshot 2',
    ...SCREENSHOT,
    colorScheme: 'light',
    noWindow: true,
    body: () => (
      <>
        <Ground kind="halo" />
        <Head
          title="Works with your cloud"
          sub="Connect as many accounts as you like and sync folders from all of them at once."
          style={{ top: 120 }}
        />
        <Chips
          at={[
            ['gdrive', 153, 360],
            ['onedrive', 513, 330],
            ['dropbox', 853, 372],
            ['protondrive', 1133, 340],
            ['nextcloud', 233, 540],
            ['owncloud', 593, 512],
            ['jottacloud', 903, 560],
            ['webdav', 1163, 530],
          ]}
        />
      </>
    ),
  },
  {
    id: 'snap-screenshot-3',
    use: 'Snap Store screenshot 3',
    ...SCREENSHOT,
    colorScheme: 'light',
    body: () => (
      <>
        <Ground kind="halo" grain />
        <Head
          left
          title="Never lose a change"
          sub="If a file changed on your computer and in the cloud since the last sync, Alto asks which version to keep."
          style={{ left: 80, top: 0, bottom: 0, width: 500 }}
        />
        <Win box={{ x: 628, y: 172, w: 860, h: 520 }} conflict />
      </>
    ),
  },
  {
    id: 'snap-screenshot-4',
    use: 'Snap Store screenshot 4',
    ...SCREENSHOT,
    colorScheme: 'light',
    body: () => (
      <>
        <Ground kind="halo" grain />
        <Head
          title="See every sync as it happens"
          sub="Open a folder to see how far along it is, how fast it’s going, and where it syncs in the cloud."
          style={{ top: 96 }}
        />
        <Win box={{ x: 308, y: 268, w: 920, h: 540 }} folder />
      </>
    ),
  },
  {
    id: 'snap-screenshot-5',
    use: 'Snap Store screenshot 5',
    ...SCREENSHOT,
    colorScheme: 'light',
    body: () => (
      <>
        <Ground kind="halo" grain />
        <Head
          title="Looks right at home"
          sub="Alto looks native on your desktop, no matter the theme."
          style={{ top: 96 }}
        />
        <Win box={{ x: 40, y: 268, w: 720, h: 520 }} scheme="light" account="dropbox" framed />
        <Win box={{ x: 776, y: 268, w: 720, h: 520 }} scheme="dark" account="nextcloud" framed />
      </>
    ),
  },
  // Uploaded by hand: Settings → Social preview.
  {
    id: 'github-preview',
    use: "the GitHub repository's social preview",
    width: 1280,
    height: 640,
    scale: 1,
    maxBytes: 1024 * 1024,
    colorScheme: 'light',
    body: () => preview({ width: 1280, height: 640 }),
  },
  {
    id: 'og',
    use: "the website's link preview (og:image)",
    width: 1200,
    height: 630,
    scale: 1,
    colorScheme: 'light',
    body: () => preview({ width: 1200, height: 630 }),
  },
  ...(['light', 'dark'] as const).map((scheme): Shot => ({
    id: `readme-${scheme}`,
    use: `README.md, in GitHub's ${scheme} theme`,
    width: 1040,
    height: 680,
    scale: 2,
    colorScheme: scheme,
    body: () => <Win box={{ x: 0, y: 0, w: 1040, h: 680 }} scheme={scheme} />,
  })),
];
