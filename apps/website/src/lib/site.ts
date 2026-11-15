/** The site's address, and where its links go. */

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

/** Whether `href` is a page on another site (which opens in a new tab: Link.tsx). */
export const isExternal = (href: string) => /^https?:\/\//.test(href);
