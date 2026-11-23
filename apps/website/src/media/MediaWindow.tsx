'use client';

// The demo window, posed and held still. Sets data-ready once drawn, for the capture.
import { baseName, conflictText, createAltoClient, formatBytes, getProvider } from '@alto/core';
import { AdwAlertDialog, GtkBox, GtkLabel } from '@gtk-js/adwaita';
import { useEffect, useState } from 'react';
import { type DemoAssets, DemoAssetsContext } from '../demo/assets';
import DemoApp from '../demo/DemoApp';
import { CONFLICT, FakeAlto } from '../demo/fake-alto';
import type { SiteProviderId } from '../lib/providers';
import '@fontsource/adwaita-sans/400.css';
import '@fontsource/adwaita-sans/700.css';
import '@fontsource/adwaita-sans/800.css';
import '../demo/demo.css';

export default function MediaWindow({
  assets,
  colorScheme,
  account = 'gdrive',
  folder,
  conflict,
}: {
  assets: DemoAssets;
  colorScheme?: 'light' | 'dark';
  /** The account it's open on. */
  account?: SiteProviderId;
  /** Open on that account's first folder's page. */
  folder?: boolean;
  /** Show the conflict dialog. */
  conflict?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [arrived, setArrived] = useState<string[]>([]);
  const [demo] = useState(() => {
    const alto = new FakeAlto();
    return { alto, client: createAltoClient(alto.transport) };
  });

  useEffect(() => {
    // The window opens on the first.
    const shown = getProvider(account).label;
    const names = demo.alto.pose(undefined, { conflict });
    setArrived([shown, ...names.filter((n) => n !== shown)]);
    // Two frames: React's render of the posed state, then its paint.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        void document.fonts.ready.then(() => setReady(true));
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [demo, account]);

  return (
    <DemoAssetsContext value={assets}>
      <div className="alto-demo" data-media-window="" data-ready={ready ? '' : undefined}>
        <DemoApp
          client={demo.client}
          colorScheme={colorScheme}
          arrived={arrived}
          openFolder={folder}
          inWindow={conflict && <ConflictDialog />}
        />
      </div>
    </DemoAssetsContext>
  );
}

/** As the app's IssueDialog describes each side. */
function describeItem(item: { size: number; mtime: number }): string {
  const when = new Date(item.mtime).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
  return `${formatBytes(item.size)}, modified ${when}`;
}

/** The app's conflict dialog (IssueDialog.tsx), open. */
function ConflictDialog() {
  const [issue] = useState(() => CONFLICT(Date.now()));
  return (
    <AdwAlertDialog
      visible
      preferWideLayout
      heading="Choose Which Version to Keep"
      body={conflictText(issue.reason, baseName(issue.path))}
      extraChild={
        <GtkBox orientation="vertical" spacing={6}>
          <GtkLabel className="caption" xalign={0} wrap label={`Local: ${describeItem(issue.local)}`} />
          <GtkLabel className="caption" xalign={0} wrap label={`Remote: ${describeItem(issue.remote)}`} />
          <GtkLabel
            className="caption dim-label"
            xalign={0}
            wrap
            label="“Keep Both” renames the local file, so both versions are kept on both sides."
          />
        </GtkBox>
      }
      responses={[
        { id: 'cancel', label: 'Cancel' },
        { id: 'remote', label: 'Keep Remote' },
        { id: 'local', label: 'Keep Local' },
        { id: 'both', label: 'Keep Both', appearance: 'suggested' },
      ]}
      defaultResponse="both"
      closeResponse="cancel"
    />
  );
}
