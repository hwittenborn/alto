/**
 * Icons from icon sets, as SVG markup sized 1em square, read when the site is
 * built: the sets are read from disk as they're needed (they're megabytes
 * each, for a handful of icons), never bundled, and never reach the page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getIconData, iconToHTML, iconToSVG } from '@iconify/utils';
import { PROVIDERS, type ProviderId } from '@alto/core';
import type { SiteProviderId } from './providers';
import { REPO_ROOT, repoFile } from './repo';

/** An icon set, as the @iconify-json packages have it. */
type IconSet = Parameters<typeof getIconData>[0];

const sets = new Map<string, IconSet>();

/** An installed set (@iconify-json/<name>), in the site's node_modules or the repository's. */
function iconSet(name: string): IconSet {
  let set = sets.get(name);
  if (!set) {
    const file = [process.cwd(), REPO_ROOT]
      .map((dir) => path.join(dir, 'node_modules/@iconify-json', name, 'icons.json'))
      .find((candidate) => fs.existsSync(candidate));
    if (!file) throw new Error(`@iconify-json/${name} isn't installed`);
    set = JSON.parse(fs.readFileSync(file, 'utf8')) as IconSet;
    sets.set(name, set);
  }
  return set;
}

/** An icon by its set and name ("simple-icons:github"). */
export function icon(name: string): string {
  const [set, id] = name.split(':') as [string, string];
  const data = getIconData(iconSet(set), id);
  if (!data) throw new Error(`No icon ${name}`);
  const { attributes, body } = iconToSVG(data, { width: '1em', height: '1em' });
  return iconToHTML(body, attributes);
}

/** The site's download mark, in its buttons. */
export const downloadIcon = () => icon('ph:download-simple-bold');

/**
 * The providers' brand logos, from selfh.st/icons (CC BY 4.0) and Nextcloud's
 * from Simple Icons (CC0), as in the app. The white ones (`-light`,
 * Nextcloud's) are for the brand color behind them; the others are full
 * color, on white.
 */
const LOGOS: Record<SiteProviderId, string> = {
  gdrive: 'selfhst:google-drive',
  dropbox: 'selfhst:dropbox-light',
  onedrive: 'selfhst:microsoft-onedrive',
  protondrive: 'selfhst:proton-drive',
  nextcloud: 'simple-icons:nextcloud',
};

/** The logos of the providers the site shows. */
export function providerLogos(): Record<SiteProviderId, string> {
  return Object.fromEntries(Object.entries(LOGOS).map(([id, name]) => [id, icon(name)])) as Record<
    SiteProviderId,
    string
  >;
}

/**
 * Every provider's logo, for the list of providers: the ones above, ownCloud's
 * (white, for its brand color) and Jottacloud's (in neither set, so the app
 * keeps it in assets/logos). WebDAV, a protocol, has no logo of its own: it
 * gets a plain cloud, white on its blue.
 */
export function allProviderLogos(): Record<ProviderId, string> {
  const extra: Partial<Record<ProviderId, () => string>> = {
    owncloud: () => icon('selfhst:owncloud-light'),
    jottacloud: () => repoFile('assets/logos/jottacloud.svg'),
    webdav: () => icon('ph:cloud-bold'),
  };
  const site = providerLogos() as Partial<Record<ProviderId, string>>;
  return Object.fromEntries(PROVIDERS.map(({ id }) => [id, site[id] ?? extra[id]?.() ?? ''])) as Record<
    ProviderId,
    string
  >;
}
