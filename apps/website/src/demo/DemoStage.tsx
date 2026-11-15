'use client';

/**
 * Alto, live in the page: the website's copy of its window (DemoApp) on a
 * pretend backend (FakeAlto), with the providers' avatars floating around it,
 * and its Start Demo button (Restart once it's going). Start Demo sends the
 * avatars into the window's sidebar one after another (slide-in.ts);
 * Restart sends them home. One per page, loaded in the browser only
 * (DemoStageLoader).
 *
 * The floating avatars are the app's own ProviderAvatar, at the sidebar's
 * size, scaled up: what slides into the window is the very avatar its row
 * shows.
 *
 * The page drives the window with events on `window`:
 * - `alto-demo:connect` (detail: a provider id) adds that account, its row hidden.
 * - `alto-demo:arrived` (detail: the account's name) shows its row.
 * - `alto-demo:departed` (detail: the account's name) hides it again.
 * - `alto-demo:reset` removes them all.
 * It dispatches `alto-demo:ready` once it's drawn, floating avatars included.
 */
import { createAltoClient } from '@alto/core';
import { GtkProviderBoundary } from '@gtk-js/gtk4';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cssVars } from '../lib/css';
import { AVATAR_SIZE, SITE_PROVIDERS, type SiteProviderId } from '../lib/providers';
import { type DemoAssets, DemoAssetsContext } from './assets';
import DemoApp from './DemoApp';
import { FakeAlto } from './fake-alto';
import { ProviderAvatar } from './ProviderAvatar';
import { DemoPending } from './DemoPending';
import { ProviderLogo } from './ProviderLogo';
import { setupSlideIn } from './slide-in';
import styles from './DemoStage.module.css';
// GNOME's interface font, in the weights GTK's theme uses (400, 700, 800).
import '@fontsource/adwaita-sans/400.css';
import '@fontsource/adwaita-sans/700.css';
import '@fontsource/adwaita-sans/800.css';
import './demo.css';

declare global {
  interface Window {
    altoDemoReady?: boolean;
  }
}

/** Where each avatar floats, in the providers' order: around the window's sides. */
const SPOTS = [
  { left: '52px', top: '14%', size: 76 },
  { left: 'calc(100% - 44px)', top: '10%', size: 66 },
  { left: '30px', top: '56%', size: 62 },
  { left: 'calc(100% - 58px)', top: '52%', size: 80 },
  { left: '64px', top: '90%', size: 64 },
];

/** The avatars' size on phones, in a row above the window. */
const PHONE_SIZE = 48;

interface Props {
  /** The window's height, as CSS. */
  height: string;
  assets: DemoAssets;
}

export default function DemoStage({ height, assets }: Props) {
  const [demo] = useState(() => {
    const alto = new FakeAlto();
    return { alto, client: createAltoClient(alto.transport) };
  });
  /** Each floating avatar's slot, once it's in the page. */
  const [slots, setSlots] = useState<Partial<Record<SiteProviderId, HTMLElement>>>({});
  const drawn = SITE_PROVIDERS.every((id) => slots[id]);
  /** Drawn, and shown (a frame on). */
  const [ready, setReady] = useState(false);
  /** Whether the demo has been started (and not restarted since). */
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const onConnect = (e: Event) => demo.alto.connect((e as CustomEvent<SiteProviderId>).detail);
    const onReset = () => demo.alto.reset();
    window.addEventListener('alto-demo:connect', onConnect);
    window.addEventListener('alto-demo:reset', onReset);
    setupSlideIn();
    return () => {
      window.removeEventListener('alto-demo:connect', onConnect);
      window.removeEventListener('alto-demo:reset', onReset);
    };
  }, [demo]);

  // Ready for the page to drive once drawn, floating avatars included.
  useEffect(() => {
    if (!drawn) return;
    const frame = requestAnimationFrame(() => {
      setReady(true);
      window.altoDemoReady = true;
      window.dispatchEvent(new Event('alto-demo:ready'));
    });
    return () => cancelAnimationFrame(frame);
  }, [drawn]);

  // Start Demo, then Restart, which sends the avatars home (Start Demo then goes again).
  const toggle = () => {
    window.dispatchEvent(new Event(started ? 'alto-demo:restart' : 'alto-demo:start'));
    setStarted(!started);
  };

  return (
    <DemoAssetsContext value={assets}>
      {!ready && <DemoPending />}
      <section
        className={styles.stage}
        id="try"
        aria-label="Alto, live"
        style={cssVars({ '--phone-size': `${PHONE_SIZE}px`, '--phone-scale': PHONE_SIZE / AVATAR_SIZE })}
      >
        <div className={styles.logos}>
          {SITE_PROVIDERS.map((id, i) => {
            const spot = SPOTS[i]!;
            return (
              <ProviderLogo
                key={id}
                provider={id}
                size={spot.size}
                className={styles.spot}
                style={{ left: spot.left, top: spot.top, ...cssVars({ '--float-delay': `${-i * 1.3}s` }) }}
                slotRef={(el) => {
                  if (el) setSlots((current) => (current[id] === el ? current : { ...current, [id]: el }));
                }}
              />
            );
          })}
        </div>
        <div className={styles.window} data-enter-settle="" style={{ height }}>
          <div className="alto-demo">
            <DemoApp client={demo.client}>
              {SITE_PROVIDERS.map((id) => {
                const slot = slots[id];
                return (
                  slot &&
                  createPortal(
                    <GtkProviderBoundary>
                      <ProviderAvatar provider={id} />
                    </GtkProviderBoundary>,
                    slot,
                    id,
                  )
                );
              })}
            </DemoApp>
          </div>
        </div>
        <div className={styles.controls}>
          <button type="button" className="button primary" onClick={toggle}>
            {started ? 'Restart' : 'Start Demo'}
          </button>
        </div>
      </section>
    </DemoAssetsContext>
  );
}
