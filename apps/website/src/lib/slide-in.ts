/**
 * The homepage's providers sliding into the live Alto window (AltoDemo): all
 * of them, one after another, on Start Demo (`alto-demo:start`).
 *
 * A floating avatar (ProviderLogo.astro) is the sidebar's own 36px avatar,
 * scaled up. When it sets off, its account is added and its row laid out,
 * hidden, so where it's going is known exactly: it flies there, shrinking
 * back to its own size, and lands on its row's avatar, which is identical.
 * The row is shown and the avatar steps aside (nothing visibly changes),
 * then the row's pill and name slide out from behind it.
 */
import type { ProviderId } from '@alto/core';
import { AVATAR_SIZE } from './providers';

/** Google Drive first, the rest this long after it (ms)... */
const FIRST_INTERVAL = 600;
/** ...and this long apart (ms): each sets off without waiting for the one before to land. */
const INTERVAL = 200;
/** How long a flight takes (ms). */
const DURATION = 1100;
/** The flights' easing, there and back. */
const FLIGHT_EASING = 'cubic-bezier(0.45, 0, 0.25, 1)';
/** How far a row's pill starts out around its avatar (px). */
const RING = 4;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function demoReady(): Promise<void> {
  if (window.altoDemoReady) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('alto-demo:ready', () => resolve(), { once: true }));
}

/** The accounts' rows in the window's sidebar. */
function sidebarRows(target: HTMLElement): HTMLElement[] {
  return [...target.querySelectorAll<HTMLElement>('.navigation-sidebar > .gtk-row[data-remote]')];
}

/** Wait a frame at a time until `check()` gives something, `cancelled()`, or 1.5s pass. */
async function waitFor<T>(check: () => T | null | undefined, cancelled: () => boolean): Promise<T | null> {
  const started = performance.now();
  while (!cancelled() && performance.now() - started < 1500) {
    const value = check();
    if (value) return value;
    await frame();
  }
  return null;
}

/** The row an account of `label` just added gets ("Dropbox", or "Dropbox 2"). */
function newRow(target: HTMLElement, before: Set<HTMLElement>, label: string): HTMLElement | undefined {
  return sidebarRows(target).find(
    (r) => !before.has(r) && (r.dataset.remote === label || r.dataset.remote?.startsWith(`${label} `)),
  );
}

/** A row's clip-paths: a circle around its avatar, and the whole row. */
function rowClips(row: HTMLElement, avatar: HTMLElement): { circle: string; full: string } {
  const r = row.getBoundingClientRect();
  const a = avatar.getBoundingClientRect();
  return {
    circle: `inset(${a.top - r.top - RING}px ${r.right - a.right - RING}px ${r.bottom - a.bottom - RING}px ${
      a.left - r.left - RING
    }px round ${a.width / 2 + RING}px)`,
    full: `inset(0 0 0 0 round ${getComputedStyle(row).borderTopLeftRadius || '8px'})`,
  };
}

/**
 * A flight's keyframes, from one point to another (each relative to where the
 * avatar was put on the page), and from one scale to another: an arc, not a
 * line, up a little first, then down onto where it's going.
 */
function arc(
  from: { x: number; y: number; scale: number; filter: string },
  to: { x: number; y: number; scale: number; filter: string },
  /** How far along the arc's top is. */
  peak: number,
  /** Its filter at the top, if not between the two. */
  peakFilter?: string,
): Keyframe[] {
  const lift = Math.min(120, Math.abs(to.y - from.y) * 0.35 + 40);
  const mid = (a: number, b: number) => a * (1 - peak) + b * peak;
  const at = (x: number, y: number, scale: number) => `translate(${x}px, ${y}px) scale(${scale})`;
  return [
    { transform: at(from.x, from.y, from.scale), filter: from.filter },
    {
      transform: at(mid(from.x, to.x), mid(from.y, to.y) - lift, (from.scale + to.scale) / 2),
      ...(peakFilter && { filter: peakFilter }),
      offset: peak,
    },
    { transform: at(to.x, to.y, to.scale), filter: to.filter },
  ];
}

/**
 * Get a shown row ready to slide out from behind its avatar: its pill (when
 * selected) starts as a circle around the avatar and widens into the row,
 * and its name and address follow it in. Set up before the row is shown, so
 * it's never drawn without them.
 */
function revealRow(row: HTMLElement, avatar: HTMLElement): void {
  const { circle, full } = rowClips(row, avatar);
  // The site's --ease-enter (src/styles/site.css).
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--ease-enter');
  row.animate([{ clipPath: circle }, { clipPath: full }], { duration: 520, delay: 60, easing, fill: 'backwards' });
  // By `translate`, not `transform`: the activity spinner turns by its
  // transform, which this would otherwise hold still while it slides in.
  for (const text of row.querySelectorAll<HTMLElement>('.alto-full-only')) {
    text.animate(
      [
        { opacity: 0, translate: '-14px 0' },
        { opacity: 1, translate: '0 0' },
      ],
      { duration: 420, delay: 180, easing, fill: 'backwards' },
    );
  }
}

/** The reverse of revealRow(): the row's pill and name fold back into its avatar. */
async function foldRow(row: HTMLElement, avatar: HTMLElement): Promise<void> {
  const { circle, full } = rowClips(row, avatar);
  const easing = 'cubic-bezier(0.55, 0, 0.75, 0.2)';
  for (const text of row.querySelectorAll<HTMLElement>('.alto-full-only')) {
    text.animate(
      [
        { opacity: 1, translate: '0 0' },
        { opacity: 0, translate: '-14px 0' },
      ],
      { duration: 180, easing, fill: 'forwards' },
    );
  }
  await row
    .animate([{ clipPath: full }, { clipPath: circle }], { duration: 260, easing, fill: 'forwards' })
    .finished.catch(() => undefined);
}

let setUp = false;

/** Start listening for Start Demo and Restart, once the demo is drawn (once per page). */
export function setupSlideIn(): void {
  if (setUp) return;
  setUp = true;
  void demoReady().then(start);
}

function start(): void {
  const target = document.querySelector<HTMLElement>('.alto-demo');
  const logos = [...document.querySelectorAll<HTMLElement>('[data-alto-provider]')];
  if (!target || logos.length === 0) return;

  /** Avatars away in the window, by the element they float in: with their floating shadow, and their account and row. */
  const away = new Map<HTMLElement, { avatar: HTMLElement; shadow: string; name: string; row: HTMLElement }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped when the avatars are called back: flights from before stop where they are. */
  let round = 0;

  const slide = async (logo: HTMLElement) => {
    if (logo.dataset.connected !== undefined) return;
    logo.dataset.connected = '';
    const mine = round;
    const provider = logo.dataset.altoProvider as ProviderId;
    const avatar = logo.querySelector<HTMLElement>('.avatar-slot');

    // Its account, its row laid out but hidden.
    const before = new Set(sidebarRows(target));
    window.dispatchEvent(new CustomEvent('alto-demo:connect', { detail: provider }));
    const label = logo.dataset.altoLabel ?? '';
    const row = await waitFor(
      () => newRow(target, before, label),
      () => mine !== round,
    );
    if (mine !== round) return;
    const rowAvatar = row?.querySelector<HTMLElement>('.alto-provider-avatar');
    const arrive = () =>
      row && window.dispatchEvent(new CustomEvent('alto-demo:arrived', { detail: row.dataset.remote }));
    if (!row || !rowAvatar || !avatar || reducedMotion()) {
      arrive();
      return;
    }

    // Out of its floating place onto the page, where it is now (on the
    // page, not the screen: it scrolls along with the window). Its place
    // holds still meanwhile, so it comes back to just where it left.
    const from = avatar.getBoundingClientRect();
    const to = rowAvatar.getBoundingClientRect();
    const fromX = from.left + from.width / 2;
    const fromY = from.top + from.height / 2;
    const dx = to.left + to.width / 2 - fromX;
    const dy = to.top + to.height / 2 - fromY;
    const shadow = getComputedStyle(avatar).filter;
    away.set(logo, { avatar, shadow, name: row.dataset.remote ?? '', row });
    logo.style.animationPlayState = 'paused';
    Object.assign(avatar.style, {
      position: 'absolute',
      left: `${fromX - AVATAR_SIZE / 2 + scrollX}px`,
      top: `${fromY - AVATAR_SIZE / 2 + scrollY}px`,
      margin: '0',
      zIndex: 'var(--z-flight)',
      pointerEvents: 'none',
      transition: 'none',
      scale: 'none',
    });
    document.body.append(avatar);

    await avatar
      .animate(
        arc(
          { x: 0, y: 0, scale: from.width / AVATAR_SIZE, filter: shadow },
          { x: dx, y: dy, scale: 1, filter: 'none' },
          0.55,
          // Lifted off the page until it's on its way down.
          shadow,
        ),
        { duration: DURATION, easing: FLIGHT_EASING, fill: 'forwards' },
      )
      .finished.catch(() => undefined);
    if (mine !== round) return;

    // Landed: the row is shown under it, then it steps aside.
    revealRow(row, rowAvatar);
    arrive();
    if (
      !(await waitFor(
        () => row.dataset.arrived !== undefined,
        () => mine !== round,
      ))
    )
      return;
    await frame();
    avatar.style.visibility = 'hidden';
  };

  /**
   * Every avatar back to where it floats, one after another, 0.2s apart: the
   * last in first, so the window stays on the first account until the end.
   * Each leaves from wherever it is (in its row, or still on its way), its
   * row folding back into it. Then the accounts are gone.
   */
  const callBack = async () => {
    round++;
    clearTimeout(timer);
    // The window's right side fades out rather than switching under the
    // avatars as they leave; it fades back in, welcoming again, once the last
    // account (the one it showed) has gone.
    const content = target.querySelector<HTMLElement>('.content-pane');
    const fadeOut = content?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 350,
      easing: 'ease-out',
      fill: 'forwards',
    });
    let welcomed = false;
    const fadeIn = async () => {
      if (welcomed || !content) return;
      welcomed = true;
      // Once the welcome is drawn there.
      await frame();
      await frame();
      fadeOut?.cancel();
      content.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-in-out' });
    };
    const trips = [...away].sort(([a], [b]) => logos.indexOf(b) - logos.indexOf(a));
    away.clear();
    await Promise.all(
      trips.map(async ([logo, { avatar, shadow, name, row }], i) => {
        await new Promise((resolve) => setTimeout(resolve, i * INTERVAL));
        // Where it shows now, as a transform from where it was put on the page.
        const r = avatar.getBoundingClientRect();
        for (const run of avatar.getAnimations()) run.cancel();
        const originX = parseFloat(avatar.style.left) + AVATAR_SIZE / 2 - scrollX;
        const originY = parseFloat(avatar.style.top) + AVATAR_SIZE / 2 - scrollY;
        const now = {
          x: r.left + r.width / 2 - originX,
          y: r.top + r.height / 2 - originY,
          scale: r.width / AVATAR_SIZE,
          filter: 'none',
        };
        avatar.style.transform = `translate(${now.x}px, ${now.y}px) scale(${now.scale})`;
        avatar.style.visibility = '';
        const rowAvatar = row.querySelector<HTMLElement>('.alto-provider-avatar');
        if (row.isConnected && row.dataset.arrived !== undefined && rowAvatar) {
          await foldRow(row, rowAvatar);
        }
        window.dispatchEvent(new CustomEvent('alto-demo:departed', { detail: name }));
        // The last account gone, the window welcomes again.
        if (i === trips.length - 1) void fadeIn();

        if (!reducedMotion()) {
          // Its place, at the size it floats at there (its --scale, by the page's layout).
          const home = logo.getBoundingClientRect();
          const homeScale = Number(getComputedStyle(logo).getPropertyValue('--scale')) || 1;
          await avatar
            .animate(
              arc(
                now,
                {
                  x: home.left + home.width / 2 - originX,
                  y: home.top + home.height / 2 - originY,
                  scale: homeScale,
                  filter: shadow,
                },
                0.45,
              ),
              { duration: DURATION, easing: FLIGHT_EASING, fill: 'forwards' },
            )
            .finished.catch(() => undefined);
        }
        // Home: back in its place, which shows again at once and floats on.
        for (const run of avatar.getAnimations()) run.cancel();
        avatar.removeAttribute('style');
        logo.prepend(avatar);
        logo.style.transition = 'none';
        delete logo.dataset.connected;
        void logo.offsetWidth;
        logo.style.removeProperty('transition');
        logo.style.removeProperty('animation-play-state');
      }),
    );
    for (const logo of logos) delete logo.dataset.connected;
    window.dispatchEvent(new Event('alto-demo:reset'));
    await fadeIn();
  };

  // In order (the README's).
  const tour = (index: number) => {
    const logo = logos[index];
    if (!logo) return;
    void slide(logo);
    timer = setTimeout(() => tour(index + 1), index === 0 ? FIRST_INTERVAL : INTERVAL);
  };

  /** Avatars on their way home (Restart), if they are. */
  let returning: Promise<void> | null = null;
  // Start Demo: once the avatars are all home.
  window.addEventListener('alto-demo:start', async () => {
    await returning;
    if (away.size > 0 || logos.some((l) => l.dataset.connected !== undefined)) return;
    tour(0);
  });
  // Restart: the avatars home again; Start Demo goes again from there.
  window.addEventListener('alto-demo:restart', () => {
    returning = callBack().finally(() => (returning = null));
  });
}
