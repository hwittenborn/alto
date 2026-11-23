'use client';

/**
 * One window filling its page, as the query says (?scheme=dark&account=protondrive):
 * for a picture with a light and a dark window, each in its own frame, since
 * GTK-JS themes a whole page at once.
 */
import { useEffect, useState } from 'react';
import type { DemoAssets } from '../demo/assets';
import type { SiteProviderId } from '../lib/providers';
import MediaWindow from './MediaWindowLoader';

export default function FrameWindow({ assets }: { assets: DemoAssets }) {
  const [query, setQuery] = useState<URLSearchParams | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    // The page's own scheme the frame's: where they differ, the browser paints the frame opaque.
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
