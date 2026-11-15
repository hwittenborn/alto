/**
 * A circular avatar with a provider's brand mark, as the app draws them in
 * its sidebar (like the account avatars in Fractal's account switcher).
 */
import { getProvider, type ProviderId } from '@alto/core';
import { AdwAvatar } from '@gtk-js/adwaita';
import { replaceIDs } from '@iconify/utils';
import { useMemo } from 'react';
import { Icon } from '../components/Icon';
import { AVATAR_SIZE, isLightTile } from '../lib/providers';
import { useDemoAssets } from './assets';

/** At the sidebar's size (AVATAR_SIZE), which the floating avatars are scaled up from. */
export function ProviderAvatar({ provider }: { provider: ProviderId }) {
  const def = getProvider(provider);
  // Each avatar gets its own gradient IDs: with shared ones, a logo goes blank
  // when the first copy in the page is hidden.
  const { logos } = useDemoAssets();
  const logo = useMemo(() => replaceIDs(logos[provider] ?? ''), [logos, provider]);
  const image = (
    <div
      className="alto-provider-avatar"
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
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
      <Icon svg={logo} style={{ fontSize: Math.round(AVATAR_SIZE * 0.6) }} />
    </div>
  );
  return <AdwAvatar size={AVATAR_SIZE} text={def.label} customImage={image} />;
}
