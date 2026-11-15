/** The providers the website shows. (Their logos: icons.ts.) */
import type { ProviderDefinition } from '@alto/core';

/** The sidebar avatars' diameter (px): the floating avatars are these, scaled up. */
export const AVATAR_SIZE = 36;

/** Whether a provider's avatar is a white tile (its logo in full color), rather than its brand color. */
export const isLightTile = (def: Pick<ProviderDefinition, 'color'>) => def.color.toUpperCase() === 'FFFFFF';

/** The providers the site shows, in this order. */
export const SITE_PROVIDERS = ['gdrive', 'dropbox', 'onedrive', 'protondrive', 'nextcloud'] as const;

export type SiteProviderId = (typeof SITE_PROVIDERS)[number];
