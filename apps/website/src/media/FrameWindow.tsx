'use client';

// One window per iframe, since GTK-JS themes a whole page at once.
import { useEffect, useState } from 'react';
import type { DemoAssets } from '../demo/assets';
import type { SiteProviderId } from '../lib/providers';
import MediaWindow from './MediaWindowLoader';

export default function FrameWindow({ assets }: { assets: DemoAssets }) {
  const [query, setQuery] = useState<URLSearchParams | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    // Must match the iframe's color-scheme, or the browser paints it opaque.
    document.documentElement.style.colorScheme = query.get('scheme') === 'dark' ? 'dark' : 'light';
    setQuery(query);
  }, []);
  if (!query) return null;
  const scheme = query.get('scheme') === 'dark' ? 'dark' : 'light';
  return (
    <div style={{ width: '100vw', height: '100vh', colorScheme: scheme }}>
      <MediaWindow
        assets={assets}
        colorScheme={scheme}
        account={(query.get('account') ?? 'gdrive') as SiteProviderId}
        folder={query.get('folder') === '1'}
      />
    </div>
  );
}
