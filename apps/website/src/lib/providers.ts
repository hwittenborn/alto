/** The providers the website shows, and its links. (Their logos: icons.ts.) */
import type { ProviderDefinition, ProviderId } from '@alto/core';

/** The sidebar avatars' diameter (px): the floating avatars are these, scaled up. */
export const AVATAR_SIZE = 36;

/** Whether a provider's avatar is a white tile (its logo in full color), rather than its brand color. */
export const isLightTile = (def: Pick<ProviderDefinition, 'color'>) => def.color.toUpperCase() === 'FFFFFF';

/** The providers the site shows, in this order. */
export const SITE_PROVIDERS: ProviderId[] = ['gdrive', 'dropbox', 'onedrive', 'protondrive', 'nextcloud'];

/** Whether `href` is a page on another site (which opens in a new tab: Link.tsx). */
export const isExternal = (href: string) => /^https?:\/\//.test(href);

/** The site's address. */
export const SITE = 'https://alto.hunterwittenborn.com';

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
