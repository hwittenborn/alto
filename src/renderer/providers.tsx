import { getProvider, type ProviderId, PROVIDERS } from '@alto/core';
import { AdwAvatar, GtkImage } from '@gtk-js/adwaita';
import { replaceIDs } from '@iconify/utils';
import { useMemo } from 'react';
import dropbox from '~icons/selfhst/dropbox-light?raw';
import googleDrive from '~icons/selfhst/google-drive?raw';
import nextcloud from '~icons/simple-icons/nextcloud?raw';
import owncloud from '~icons/selfhst/owncloud-light?raw';
import protonDrive from '~icons/selfhst/proton-drive?raw';

/**
 * Brand logos as SVG markup, by `iconSlug`: from selfh.st/icons (CC BY 4.0),
 * and Nextcloud's from Simple Icons (CC0), whose selfh.st logos are all app
 * tiles. The `-light` ones and Nextcloud's are white, for the brand color
 * behind them. The others are full color, on white.
 */
const LOGOS: Record<string, string> = {
  'dropbox-light': dropbox,
  'google-drive': googleDrive,
  nextcloud,
  'owncloud-light': owncloud,
  'proton-drive': protonDrive,
};

/** GTK icon (PascalCase, gtk-js naming) used when a provider has no brand glyph. */
const FALLBACK_ICONS: Record<string, string> = {
  'folder-remote-symbolic': 'FolderRemote',
};

export function providerLabel(provider: ProviderId | null): string {
  return provider ? getProvider(provider).label : 'rclone';
}

/**
 * A circular avatar with the provider's brand mark, like the account avatars
 * in Fractal's account switcher.
 */
export function ProviderAvatar({ provider, size = 32 }: { provider: ProviderId | null; size?: number }) {
  const def = provider ? getProvider(provider) : null;
  // Each avatar gets its own gradient IDs: with shared ones, a logo goes blank
  // when the first copy in the page is hidden.
  const logo = useMemo(() => {
    const svg = def?.iconSlug ? LOGOS[def.iconSlug] : undefined;
    return svg && replaceIDs(svg);
  }, [def?.iconSlug]);
  // Symbolic icons are drawn on a 16px grid: about half the avatar, like
  // AdwAvatar's icon, but on the grid so their thin strokes stay sharp.
  const iconSize = Math.max(16, Math.floor(size / 32) * 16);
  const image = (
    <div
      className="alto-provider-avatar"
      style={{
        width: size,
        height: size,
        background: `#${def?.color ?? '77767b'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        // A white tile keeps its edge on white rows and dark backgrounds alike.
        // Round, so the edge follows the avatar's circle all the way around.
        borderRadius: '50%',
        boxShadow: def?.color === 'FFFFFF' ? 'inset 0 0 0 1px rgb(0 0 0 / 12%)' : undefined,
      }}
    >
      {logo ? (
        // The SVG is sized 1em square.
        <span
          aria-hidden="true"
          style={{ display: 'flex', fontSize: Math.round(size * 0.6) }}
          dangerouslySetInnerHTML={{ __html: logo }}
        />
      ) : (
        <GtkImage iconName={FALLBACK_ICONS[def?.fallbackIcon ?? ''] ?? 'FolderRemote'} pixelSize={iconSize} />
      )}
    </div>
  );
  return <AdwAvatar size={size} text={def?.label ?? 'rclone'} customImage={image} />;
}

export const PROVIDER_LIST = PROVIDERS;
