/**
 * The providers the website shows, with their brand logos as SVG markup: from
 * selfh.st/icons (CC BY 4.0) and Nextcloud's from Simple Icons (CC0), as in the app.
 */
import { getProvider, type ProviderDefinition, type ProviderId } from '@alto/core';
import { replaceIDs } from '@iconify/utils';
import dropbox from '~icons/selfhst/dropbox-light?raw';
import googleDrive from '~icons/selfhst/google-drive?raw';
import nextcloud from '~icons/simple-icons/nextcloud?raw';
import oneDrive from '~icons/selfhst/microsoft-onedrive?raw';
import protonDrive from '~icons/selfhst/proton-drive?raw';

/** The sidebar avatars' diameter (px): the floating avatars are these, scaled up. */
export const AVATAR_SIZE = 36;

/** Whether a provider's avatar is a white tile (its logo in full color), rather than its brand color. */
export const isLightTile = (def: Pick<ProviderDefinition, 'color'>) => def.color.toUpperCase() === 'FFFFFF';

/** The providers the site shows, in this order. */
const SITE_PROVIDERS: ProviderId[] = ['gdrive', 'dropbox', 'onedrive', 'protondrive', 'nextcloud'];

/** The white ones (`-light`, Nextcloud's) are for the brand color behind them; the others are full color, on white. */
const LOGOS: Partial<Record<ProviderId, string>> = {
  gdrive: googleDrive,
  dropbox,
  onedrive: oneDrive,
  protondrive: protonDrive,
  nextcloud,
};

/** A provider's logo as SVG markup (sized 1em square), or '' when it has none. */
export function providerLogo(id: ProviderId): string {
  return LOGOS[id] ?? '';
}

export interface SiteProvider {
  id: ProviderId;
  label: string;
  /** Brand color behind the logo, as CSS. */
  color: string;
  /** Logo markup, sized 1em square. */
  logo: string;
  /** Whether the logo is white, for the brand color behind it. */
  onColor: boolean;
}

export function siteProviders(): SiteProvider[] {
  return SITE_PROVIDERS.map(getProvider).map((p) => ({
    id: p.id,
    label: p.label,
    color: `#${p.color}`,
    // Each copy its own gradient IDs: with shared ones, a copy goes blank when the first is hidden.
    logo: replaceIDs(LOGOS[p.id] ?? ''),
    onColor: !isLightTile(p),
  }));
}

export const LINKS = {
  snap: 'https://snapcraft.io/alto',
  /** Opens Alto in the desktop's Snap Store app. */
  snapApp: 'snap://alto',
  github: 'https://github.com/hwittenborn/alto',
  issues: 'https://github.com/hwittenborn/alto/issues',
  install: '/install',
  privacy: '/privacy',
  changelog: '/changelog',
};
