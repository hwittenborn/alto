/**
 * A provider's avatar, floating by the demo window: just to look at. Its slot
 * holds the window's own avatar (ProviderAvatar, at the sidebar's size, put
 * there by DemoStage) scaled up to `size`. Start Demo moves the slot into
 * the window's sidebar (src/lib/slide-in.ts), which finds it by its data
 * attributes and the `avatar-slot` class.
 */
import { getProvider, type ProviderId } from '@alto/core';
import type { CSSProperties, Ref } from 'react';
import { cssVars } from '../lib/css';
import { AVATAR_SIZE } from '../lib/providers';

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
      className={`[--size:var(--float-size)] [--scale:var(--float-scale)] inline-flex items-center justify-center min-w-(--size) min-h-(--size) transition-opacity duration-400 ease-[ease] animate-float data-connected:opacity-0 motion-reduce:animate-none ${className ?? ''}`}
      data-alto-provider={provider}
      data-alto-label={label}
      style={{
        ...cssVars({
          '--float-size': `${size}px`,
          '--float-scale': size / AVATAR_SIZE,
          '--avatar': `${AVATAR_SIZE}px`,
        }),
        ...style,
      }}
    >
      <span
        ref={slotRef}
        className={`avatar-slot block flex-none size-(--avatar) m-[calc((var(--size)-var(--avatar))/2)] rounded-full [scale:var(--scale)] [filter:drop-shadow(0_6px_8px_rgb(0_0_0/22%))_drop-shadow(0_1px_1.5px_rgb(0_0_0/12%))]`}
      />
    </span>
  );
}
