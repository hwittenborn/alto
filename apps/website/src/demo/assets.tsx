/**
 * What the demo draws that's read when the site is built (src/lib/icons.ts,
 * src/lib/app-icon.ts), handed down from the page: the providers' logos and
 * Alto's icon, as SVG markup.
 */
import type { ProviderId } from '@alto/core';
import { createContext, useContext } from 'react';

export interface DemoAssets {
  logos: Partial<Record<ProviderId, string>>;
  appIcon: string;
}

export const DemoAssetsContext = createContext<DemoAssets | null>(null);

export function useDemoAssets(): DemoAssets {
  const assets = useContext(DemoAssetsContext);
  if (!assets) throw new Error('useDemoAssets() outside DemoStage');
  return assets;
}
