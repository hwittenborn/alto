/**
 * A circular avatar with a provider's brand mark, as the app draws them in
 * its sidebar (like the account avatars in Fractal's account switcher).
 */
import { getProvider, type ProviderId } from '@alto/core';
import { AdwAvatar } from '@gtk-js/adwaita';
import { replaceIDs } from '@iconify/utils';
import { useMemo } from 'react';
import { AVATAR_SIZE, isLightTile, providerLogo } from '../lib/providers';

export function ProviderAvatar({ provider, size = AVATAR_SIZE }: { provider: ProviderId; size?: number }) {
  const def = getProvider(provider);
  // Each avatar gets its own gradient IDs: with shared ones, a logo goes blank
  // when the first copy in the page is hidden.
  const logo = useMemo(() => replaceIDs(providerLogo(provider)), [provider]);
  const image = (
    <div
      className="alto-provider-avatar"
      style={{
        width: size,
        height: size,
        background: `#${def.color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        borderRadius: '50%',
        // A white tile keeps its edge on white rows and dark backgrounds alike.
        boxShadow: isLightTile(def) ? 'inset 0 0 0 1px rgb(0 0 0 / 12%)' : undefined,
      }}
    >
      {/* The SVG is sized 1em square. */}
      <span
        aria-hidden="true"
        style={{ display: 'flex', fontSize: Math.round(size * 0.6) }}
        dangerouslySetInnerHTML={{ __html: logo }}
      />
    </div>
  );
  return <AdwAvatar size={size} text={def.label} customImage={image} />;
}
