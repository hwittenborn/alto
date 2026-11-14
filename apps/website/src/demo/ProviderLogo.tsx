/**
 * A provider's avatar, floating by the demo window: just to look at. Its slot
 * holds the window's own avatar (ProviderAvatar, at the sidebar's size, put
 * there by DemoStage) scaled up to `size`. Start Demo moves the slot into
 * the window's sidebar (src/lib/slide-in.ts), which finds it by its data
 * attributes and the `avatar-slot` class.
 */
import { getProvider, type ProviderId } from '@alto/core';
import type { CSSProperties, Ref } from 'react';
import { AVATAR_SIZE } from '../lib/providers';
import styles from './ProviderLogo.module.css';

interface Props {
  provider: ProviderId;
  /** Diameter (px). */
  size: number;
  className?: string;
  style?: CSSProperties;
  /** The slot its avatar goes in. */
  slotRef: Ref<HTMLSpanElement>;
}

export function ProviderLogo({ provider, size, className, style, slotRef }: Props) {
  const { label } = getProvider(provider);
  return (
    <span
      role="img"
      aria-label={label}
      className={className ? `${styles.logo} ${className}` : styles.logo}
      data-alto-provider={provider}
      data-alto-label={label}
      style={
        {
          '--float-size': `${size}px`,
          '--float-scale': size / AVATAR_SIZE,
          '--avatar': `${AVATAR_SIZE}px`,
          ...style,
        } as CSSProperties
      }
    >
      <span ref={slotRef} className={`avatar-slot ${styles.slot}`} />
    </span>
  );
}
