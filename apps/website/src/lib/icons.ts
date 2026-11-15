/**
 * Icons from icon sets, as SVG markup sized 1em square, read when the site is
 * built (in server components: the sets themselves never reach the page).
 */
import ph from '@iconify-json/ph/icons.json';
import selfhst from '@iconify-json/selfhst/icons.json';
import simpleIcons from '@iconify-json/simple-icons/icons.json';
import type { ProviderId } from '@alto/core';
import { getIconData, iconToHTML, iconToSVG } from '@iconify/utils';
import { SITE_PROVIDERS } from './providers';

/** An icon set, as the @iconify-json packages have it. */
type IconSet = Parameters<typeof getIconData>[0];

const SETS: Record<string, IconSet> = { ph, selfhst, 'simple-icons': simpleIcons };

/** An icon by its set and name ("simple-icons:github"). */
export function icon(name: string): string {
  const [set, id] = name.split(':') as [string, string];
  const data = SETS[set] && getIconData(SETS[set], id);
  if (!data) throw new Error(`No icon ${name}`);
  const { attributes, body } = iconToSVG(data, { width: '1em', height: '1em' });
  return iconToHTML(body, attributes);
}

/**
 * The providers' brand logos, from selfh.st/icons (CC BY 4.0) and Nextcloud's
 * from Simple Icons (CC0), as in the app. The white ones (`-light`,
 * Nextcloud's) are for the brand color behind them; the others are full
 * color, on white.
 */
const LOGOS: Partial<Record<ProviderId, string>> = {
  gdrive: 'selfhst:google-drive',
  dropbox: 'selfhst:dropbox-light',
  onedrive: 'selfhst:microsoft-onedrive',
  protondrive: 'selfhst:proton-drive',
  nextcloud: 'simple-icons:nextcloud',
};

/** The logos of the providers the site shows. */
export function providerLogos(): Partial<Record<ProviderId, string>> {
  return Object.fromEntries(SITE_PROVIDERS.map((id) => [id, LOGOS[id] ? icon(LOGOS[id]) : '']));
}
