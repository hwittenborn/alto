/**
 * Alto, live in the page: the website's copy of its window (DemoApp) on a
 * pretend backend (FakeAlto). Mounted client-side only (`client:only="react"`).
 *
 * It also draws the page's floating provider avatars: the app's own
 * ProviderAvatar, at the sidebar's size, in each `[data-alto-provider]
 * .avatar-slot` (ProviderLogo.astro, which scales it up while it floats).
 * What slides into the window is then the very avatar its row shows.
 *
 * The page drives it with events on `window`:
 * - `alto-demo:connect` (detail: a provider id) adds that account, its row hidden.
 * - `alto-demo:arrived` (detail: the account's name) shows its row.
 * - `alto-demo:departed` (detail: the account's name) hides it again.
 * - `alto-demo:reset` removes them all.
 * It dispatches `alto-demo:ready` once it's drawn.
 */
import { createAltoClient, type ProviderId } from '@alto/core';
import { GtkProviderBoundary } from '@gtk-js/gtk4';
import { ProviderAvatar } from './ProviderAvatar';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AVATAR_SIZE } from '../lib/providers';
import DemoApp from './DemoApp';
import { FakeAlto } from './fake-alto';
import './demo.css';

declare global {
  interface Window {
    altoDemoReady?: boolean;
  }
}

/** The page's floating avatars, in their slots. */
function FloatingAvatars() {
  const [slots, setSlots] = useState<Array<{ el: HTMLElement; provider: ProviderId }>>([]);
  useEffect(() => {
    setSlots(
      [...document.querySelectorAll<HTMLElement>('[data-alto-provider]')].flatMap((button) => {
        const el = button.querySelector<HTMLElement>('.avatar-slot');
        if (!el) return [];
        // In place of the look-alike markup shown until now.
        el.replaceChildren();
        return [{ el, provider: button.dataset.altoProvider as ProviderId }];
      }),
    );
  }, []);
  return slots.map(({ el, provider }) =>
    createPortal(
      <GtkProviderBoundary>
        <ProviderAvatar provider={provider} size={AVATAR_SIZE} />
      </GtkProviderBoundary>,
      el,
      provider,
    ),
  );
}

export default function AltoDemo({ height = '640px' }: { height?: string }) {
  const [demo] = useState(() => {
    const alto = new FakeAlto();
    return { alto, client: createAltoClient(alto.transport) };
  });

  useEffect(() => {
    const onConnect = (e: Event) => demo.alto.connect((e as CustomEvent<ProviderId>).detail);
    const onReset = () => demo.alto.reset();
    window.addEventListener('alto-demo:connect', onConnect);
    window.addEventListener('alto-demo:reset', onReset);
    // Ready for the page to drive once drawn, floating avatars included.
    const frame = requestAnimationFrame(() => {
      window.altoDemoReady = true;
      window.dispatchEvent(new Event('alto-demo:ready'));
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('alto-demo:connect', onConnect);
      window.removeEventListener('alto-demo:reset', onReset);
    };
  }, [demo]);

  return (
    <div className="alto-demo" style={{ height }}>
      <DemoApp client={demo.client}>
        <FloatingAvatars />
      </DemoApp>
    </div>
  );
}
