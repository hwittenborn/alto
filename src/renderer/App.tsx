import { baseName, createAltoClient, type FolderView, formatLocalPath, formatRemotePath } from '@alto/core';
import { AltoProvider, useAlto, useAltoState, useFolder, useHomeDir, useRemote } from '@alto/react';
import {
  AdwAlertDialog,
  AdwBreakpointBin,
  AdwHeaderBar,
  AdwNavigationSplitView,
  AdwNavigationView,
  AdwStatusPage,
  AdwToolbarView,
  GtkButton,
  GtkMenuButton,
  type GtkMenuModel,
  GtkSpinner,
  GtkToggleButton,
  GtkWindow,
  GtkWindowControls,
  GtkWindowTitle,
} from '@gtk-js/adwaita';
import { createGtkIconFromSvg } from '@gtk-js/icon-helpers';
import googleGSvg from '../../assets/auth/google-g.svg?raw';
import appIconSvg from '../../assets/icons/com.hunterwittenborn.Alto.svg?raw';
import { Component, type ReactNode, useCallback, useEffect, useMemo, useLayoutEffect, useRef, useState } from 'react';
import { AddFolderDialog } from './components/AddFolderDialog';
import { AboutDialog, PreferencesDialog } from './components/AppDialogs';
import { ErrorDialog } from './components/ErrorDialog';
import { FolderList } from './components/FolderList';
import { FolderPage } from './components/FolderPage';
import { LoginDialog, LoginPage } from './components/LoginDialog';
import { buildMainMenu, Sidebar } from './components/Sidebar';
import type { Theme } from './theme';
import { host, ToastProvider, useRetained, useToast } from './ui';

const client = createAltoClient(window.altoTransport);
// The app's own icons, over the theme's. The application icon, by name like an icon theme's, for the about dialog
// and the welcome on the login page. Inlined, so it's drawn with the window instead of popping in after it.
const icons = {
  ComHunterwittenbornAlto: createGtkIconFromSvg('ComHunterwittenbornAlto', appIconSvg),
  // Google's "G" from its Sign in with Google assets, which its branding
  // requires on the button that starts a Google Drive login.
  GoogleG: createGtkIconFromSvg('GoogleG', googleGSvg),
};

/** Below this width the split view collapses into a single pane. */
const COLLAPSE_WIDTH = 640;
/**
 * The sidebar narrowed to the accounts' avatars: a 36px avatar in an
 * account's row (2px padding) in a navigation-sidebar row (6px margins, 8px
 * padding), where the full sidebar has it.
 */
const RAIL_WIDTH = 68;
/** The full sidebar: 30% of the window, from 240 to 300px. */
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 300;
const SIDEBAR_FRACTION = 0.3;
const RAIL_KEY = 'alto.sidebar';

/** Whether the sidebar was last narrowed to its avatars (remembered per user, like GSettings would). */
function useRail(): [boolean, () => void] {
  const [rail, setRail] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === 'rail';
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setRail((current) => {
      try {
        localStorage.setItem(RAIL_KEY, current ? 'full' : 'rail');
      } catch {
        // Not remembered, then.
      }
      return !current;
    });
  }, []);
  return [rail, toggle];
}

/**
 * AdwOverlaySplitView's show/hide spring, `adw_spring_params_new (1, 0.5, 500)`:
 * critically damped, so its angular frequency √(k/m) is all there is to it.
 */
const SIDEBAR_SPRING_OMEGA = Math.sqrt(500 / 0.5);
/** `AdwSpringAnimation`'s default epsilon. */
const SPRING_EPSILON = 0.001;

/**
 * AdwOverlaySplitView's spring as a CSS `linear()` easing, and how long it
 * lasts (ms): from rest to rest it's `1 − e^(−ωt)(1 + ωt)`, until within
 * AdwSpringAnimation's epsilon.
 */
const SIDEBAR_SPRING = (() => {
  const omega = SIDEBAR_SPRING_OMEGA;
  const remaining = (t: number) => Math.exp(-omega * t) * (1 + omega * t);
  let duration = 0;
  while (remaining(duration) >= SPRING_EPSILON) duration += 0.001;
  const points = Array.from({ length: 41 }, (_, i) => (i === 40 ? 1 : 1 - remaining((duration * i) / 40)).toFixed(4));
  return { easing: `linear(${points.join(', ')})`, duration: duration * 1000 };
})();

/**
 * How a part of the window looks with the sidebar full, and narrowed to
 * avatars. What only one of them has (`only`) is there for the half of the
 * way nearer to it, so it's gone before what takes its place arrives.
 */
interface SidebarMotionPart {
  element: Element;
  full: Keyframe;
  rail: Keyframe;
  only?: 'full' | 'rail';
}

/** A part's keyframes, from full to narrow (`toRail`) or back. */
function sidebarMotionKeyframes({ full, rail, only }: SidebarMotionPart, toRail: boolean): Keyframe[] {
  const frames = only ? [full, { ...(only === 'full' ? rail : full), offset: 0.5 }, rail] : [full, rail];
  return toRail ? frames : frames.reverse();
}

/**
 * The parts that move with the sidebar, as they are while it moves (see
 * useSidebarMotion()), each from how it looks next to the full sidebar to
 * how it looks next to the narrow one. All of them move by transforms and
 * fade by opacity, which the compositor animates: they stay in step however
 * busy the page is, as they wouldn't if any were laid out or clipped again
 * at each step. `restore` undoes what's set up for them.
 */
function sidebarMotionParts(
  view: HTMLElement,
  clip: HTMLElement,
  full: number,
): { parts: SidebarMotionPart[]; restore(): void } {
  const parts: SidebarMotionPart[] = [];
  const shift = (x: number) => ({ transform: `translateX(${x}px)` });
  const all = (root: Element, selector: string) => [...root.querySelectorAll(selector)];
  const edge = full - RAIL_WIDTH;

  // The sidebar is laid out full and narrows by sliding its clip to the
  // start (with its background and edge) while what's in it slides back.
  parts.push({ element: clip, full: shift(0), rail: shift(-edge) });
  for (const sidebar of all(clip, ':scope > *')) parts.push({ element: sidebar, full: shift(0), rail: shift(edge) });

  // Its title moves to stay in the middle and fades, Add Account fades, the
  // main menu moves to where the narrow one has it, and what only the narrow
  // one has fades in.
  const header = clip.querySelector('.top-bar .gtk-headerbar');
  if (header) {
    const left = clip.getBoundingClientRect().left;
    for (const title of all(header, '.gtk-center-layout-center')) {
      parts.push({ element: title, full: shift(0), rail: shift(-edge / 2) });
    }
    for (const element of all(header, '.gtk-center-layout-center > *, .gtk-center-layout-start')) {
      parts.push({ element, full: { opacity: 1 }, rail: { opacity: 0 }, only: 'full' });
    }
    for (const end of all(header, '.gtk-center-layout-end')) {
      const box = end.getBoundingClientRect();
      parts.push({ element: end, full: shift(0), rail: shift(RAIL_WIDTH / 2 - (box.left - left + box.width / 2)) });
    }
  }
  // So do the accounts' names, and what they're up to moves to a badge.
  for (const element of all(clip, '.alto-full-only')) {
    parts.push({ element, full: { opacity: 1 }, rail: { opacity: 0 }, only: 'full' });
  }
  for (const element of all(clip, '.alto-rail-only')) {
    parts.push({ element, full: { opacity: 0 }, rail: { opacity: 1 }, only: 'rail' });
  }

  // The rows narrow with their rounded ends rather than being cut off: what
  // a row draws (selected, hovered) is drawn by a copy that slides under a
  // window as rounded as the row (.alto-row-motion).
  const added: Element[] = [];
  const marked: HTMLElement[] = [];
  for (const row of all(clip, '.navigation-sidebar > .gtk-row')) {
    const style = getComputedStyle(row);
    if (style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage === 'none') continue;
    const window = document.createElement('div');
    window.className = 'alto-row-motion';
    const fill = window.appendChild(document.createElement('div'));
    fill.style.backgroundColor = style.backgroundColor;
    fill.style.backgroundImage = style.backgroundImage;
    row.prepend(window);
    (row as HTMLElement).dataset.altoMoving = '';
    added.push(window);
    marked.push(row as HTMLElement);
    parts.push({ element: fill, full: shift(0), rail: shift(-edge) });
  }

  // The content is laid out next to the narrow sidebar, and the sidebar
  // covers it. What's at its start moves with the sidebar's edge, and what's
  // centered by half as much, as they would if it were laid out again next
  // to the sidebar at each step. Only its pages' own toolbar views: a
  // toolbar view in one moves with it.
  const content = view.querySelector('.content-pane');
  const toolbars = content
    ? all(content, '.gtk-toolbarview').filter((t) => !t.parentElement?.closest('.gtk-toolbarview'))
    : [];
  for (const toolbar of toolbars) {
    for (const start of all(toolbar, ':scope > .top-bar .gtk-headerbar .gtk-center-layout-start')) {
      parts.push({ element: start, full: shift(edge), rail: shift(0) });
    }
    for (const center of [
      ...all(toolbar, ':scope > .top-bar .gtk-headerbar .gtk-center-layout-center'),
      ...all(toolbar, ':scope > :not(.top-bar):not(.bottom-bar)'),
    ]) {
      parts.push({ element: center, full: shift(edge / 2), rail: shift(0) });
    }
  }
  return {
    parts,
    restore() {
      for (const element of added) element.remove();
      // The rows draw themselves again at once, as their copies go: a theme
      // whose rows transition their background would fade it back in.
      for (const row of marked) {
        row.style.transition = 'none';
        delete row.dataset.altoMoving;
      }
      for (const row of marked) {
        // Applied before transitions are back.
        getComputedStyle(row).getPropertyValue('background-color');
        row.style.transition = '';
      }
    },
  };
}

/**
 * Moves the sidebar between full and narrowed to its avatars when `rail`
 * changes, with AdwOverlaySplitView's spring. While it moves, the window is
 * laid out once: the content as wide as it is next to the narrow sidebar,
 * and the sidebar laid out full, over the content (`.alto-sidebar-clip.moving`).
 * From frame to frame only the parts sidebarMotionParts() moves change, in
 * step: no part jumps when it starts or ends, nor falls behind the others
 * while the page is busy. A change mid-way turns the movement around. Returns
 * the movement while there is one: which way, and the full sidebar's width.
 */
function useSidebarMotion(rail: boolean, view: React.RefObject<HTMLDivElement | null>, fullWidth: () => number) {
  const [moving, setMoving] = useState<{ toRail: boolean; full: number } | null>(null);
  const animations = useRef<Animation[] | null>(null);
  const frame = useRef(0);
  // Held where they are until the frame that lays the window out for them
  // (which takes a while) has been drawn, so the spring doesn't skip ahead
  // by as long as that frame took.
  const holdThenPlay = (runs: Animation[]) => {
    for (const run of runs) run.pause();
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        for (const run of runs) run.play();
      });
    });
  };
  const shown = useRef(rail);
  useLayoutEffect(() => {
    if (shown.current === rail) return;
    shown.current = rail;
    if (animations.current) {
      for (const run of animations.current) run.reverse();
      holdThenPlay(animations.current);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setMoving({ toRail: rail, full: fullWidth() });
  }, [rail]);
  useLayoutEffect(() => {
    const clip = view.current?.querySelector<HTMLElement>('.alto-sidebar-clip');
    if (!moving || !view.current || !clip) return;
    // Filled both ways: turned around, a movement finishes at its start.
    const { parts, restore } = sidebarMotionParts(view.current, clip, moving.full);
    const runs = parts.map((part) =>
      part.element.animate(sidebarMotionKeyframes(part, moving.toRail), { ...SIDEBAR_SPRING, fill: 'both' }),
    );
    holdThenPlay(runs);
    animations.current = runs;
    runs[0].onfinish = () => {
      animations.current = null;
      setMoving(null);
    };
    // Held until the render without them, so nothing shows its resting place early.
    return () => {
      cancelAnimationFrame(frame.current);
      for (const run of runs) run.cancel();
      restore();
    };
  }, [moving]);
  return moving;
}

/** Without accounts: Alto is set up, and the next step is connecting one. */
interface ContentProps {
  remoteName: string;
  stack: string[];
  setStack(stack: string[]): void;
  collapsed: boolean;
  /** Narrows or widens the sidebar, at the start of the header bars. */
  sidebarButton: ReactNode;
  onAddFolder(): void;
}

function RemoteContent({ remoteName, stack, setStack, collapsed, sidebarButton, onAddFolder }: ContentProps) {
  const alto = useAlto();
  const remote = useRemote(remoteName);
  const folders = useAltoState((s) => s.folders.filter((f) => f.remote === remoteName).map((f) => f.id));
  const openFolderId = stack[1]?.replace(/^folder:/, '') ?? null;
  const home = useHomeDir();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stopping, setStopping] = useState<FolderView | null>(null);
  // Keep the dialog's text while it animates closed.
  const stopShown = useRetained(stopping);
  const toast = useToast();

  // Leave a folder page when the folder goes away.
  useEffect(() => {
    if (openFolderId && !folders.includes(openFolderId)) setStack(['folders']);
  }, [openFolderId, folders, setStack]);

  const remoteMenu: GtkMenuModel = [
    [
      { label: 'Add Folder…', accel: 'Ctrl+N', onActivate: onAddFolder },
      { label: 'Sync Now', onActivate: () => void alto.syncRemote(remoteName) },
    ],
    [{ label: 'Remove Account…', onActivate: () => setConfirmDelete(true) }],
  ];

  const pages = [
    {
      tag: 'folders',
      title: remoteName,
      children: (
        <AdwToolbarView
          style={{ height: '100%' }}
          topBars={
            <AdwHeaderBar
              showStartTitleButtons={collapsed}
              start={sidebarButton}
              titleWidget={<GtkWindowTitle title={remoteName} subtitle={remote?.account ?? undefined} />}
              end={
                <GtkMenuButton iconName="OpenMenu" hasFrame={false} menuModel={remoteMenu} tooltipText="Account Menu" />
              }
            />
          }
          content={
            <FolderList
              remoteName={remoteName}
              onAddFolder={onAddFolder}
              onOpenFolder={(id) => setStack(['folders', `folder:${id}`])}
            />
          }
        />
      ),
    },
    ...folders.map((id) => ({
      tag: `folder:${id}`,
      title: id,
      children: (
        <FolderPageView
          id={id}
          remoteName={remoteName}
          collapsed={collapsed}
          sidebarButton={sidebarButton}
          onStopSyncing={setStopping}
        />
      ),
    })),
  ];

  return (
    <>
      <AdwNavigationView pages={pages} stack={stack} onStackChange={setStack} style={{ height: '100%' }} />
      <AdwAlertDialog
        visible={confirmDelete}
        heading={`Remove '${remoteName}'?`}
        body="Its folders will stop syncing. No files are deleted, on this computer or on the server."
        responses={[
          { id: 'cancel', label: 'Cancel' },
          { id: 'delete', label: 'Remove', appearance: 'destructive' },
        ]}
        defaultResponse="cancel"
        closeResponse="cancel"
        onResponse={(id) => {
          setConfirmDelete(false);
          if (id === 'delete') {
            void alto.deleteRemote(remoteName).then(() => toast(`Removed '${remoteName}'`));
          }
        }}
      />
      <AdwAlertDialog
        visible={stopping !== null}
        heading={stopShown ? `Stop Syncing '${baseName(stopShown.localPath) || '/'}'?` : ''}
        body={
          stopShown
            ? `'${formatLocalPath(stopShown.localPath, home)}' and '${remoteName}:${formatRemotePath(stopShown.remotePath)}' will no longer be kept in sync. No files are deleted, and you can add the folder again at any time.`
            : ''
        }
        responses={[
          { id: 'cancel', label: 'Cancel' },
          { id: 'stop', label: 'Stop Syncing', appearance: 'destructive' },
        ]}
        defaultResponse="cancel"
        closeResponse="cancel"
        onResponse={(id) => {
          setStopping(null);
          if (id === 'stop' && stopping) {
            setStack(['folders']);
            void alto.removeFolder(stopping.id);
          }
        }}
      />
    </>
  );
}

/** The folder, or the last known state of it once it's gone (while its page slides out). */
function useRetainedFolder(id: string): FolderView | null {
  return useRetained(useFolder(id));
}

function FolderPageView({
  id,
  remoteName,
  collapsed,
  sidebarButton,
  onStopSyncing,
}: {
  id: string;
  remoteName: string;
  collapsed: boolean;
  sidebarButton: ReactNode;
  onStopSyncing(folder: FolderView): void;
}) {
  const alto = useAlto();
  const home = useHomeDir();
  const folder = useRetainedFolder(id);
  if (!folder) return null;
  const menu: GtkMenuModel = [
    [
      { label: 'Open Folder', onActivate: () => void host.openPath(folder.localPath) },
      {
        label: folder.paused ? 'Resume Syncing' : 'Pause Syncing',
        onActivate: () => void alto.setFolderPaused(folder.id, !folder.paused),
      },
    ],
    [{ label: 'Stop Syncing…', onActivate: () => onStopSyncing(folder) }],
  ];
  return (
    <AdwToolbarView
      style={{ height: '100%' }}
      topBars={
        <AdwHeaderBar
          showStartTitleButtons={collapsed}
          start={sidebarButton}
          titleWidget={
            <GtkWindowTitle
              title={baseName(folder.localPath) || formatLocalPath(folder.localPath, home)}
              subtitle={`${remoteName}:${formatRemotePath(folder.remotePath)}`}
            />
          }
          end={
            <>
              <GtkButton
                iconName="ViewRefresh"
                hasFrame={false}
                tooltipText="Sync Now"
                onClicked={() => void alto.syncNow(folder.id)}
              />
              <GtkMenuButton iconName="OpenMenu" hasFrame={false} menuModel={menu} tooltipText="Folder Menu" />
            </>
          }
        />
      }
      content={<FolderPage folder={folder} />}
    />
  );
}

/** The app. */
function Shell() {
  const ready = useAltoState((s) => s.ready);
  const error = useAltoState((s) => s.error);
  const remotes = useAltoState((s) => s.remotes.map((r) => r.name));
  const [selected, setSelected] = useState<string | null>(null);
  const [stack, setStack] = useState<string[]>(['folders']);
  const [collapsed, setCollapsed] = useState(false);
  const [rail, toggleRail] = useRail();
  // A narrow window shows one pane at a time instead.
  const railed = rail && !collapsed;
  const splitViewRef = useRef<HTMLDivElement>(null);
  // The full sidebar's width, as AdwNavigationSplitView gives it: 30% of the view, clamped.
  const fullSidebarWidth = () =>
    Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, Math.floor((splitViewRef.current?.clientWidth ?? 0) * SIDEBAR_FRACTION)),
    );
  const sidebarMoving = useSidebarMotion(railed, splitViewRef, fullSidebarWidth);
  const [showContent, setShowContent] = useState(false);
  const [dialog, setDialog] = useState<'login' | 'add-folder' | 'about' | 'preferences' | null>(null);

  // Keep a valid selection.
  useEffect(() => {
    if (selected && remotes.includes(selected)) return;
    setSelected(remotes[0] ?? null);
    setStack(['folders']);
    // The selected account's content is what a wide window shows; keep
    // showing it if the window becomes narrow.
    if (!collapsed) setShowContent(remotes.length > 0);
  }, [remotes, selected, collapsed]);

  const select = useCallback((name: string) => {
    setSelected((current) => {
      if (current !== name) setStack(['folders']);
      return name;
    });
    setShowContent(true);
  }, []);

  // Notification clicks ask to show a folder.
  useEffect(
    () =>
      window.electronAPI.onShowFolder((folderId) => {
        const folder = client.store.getState().folders.find((f) => f.id === folderId);
        if (!folder) return;
        setSelected(folder.remote);
        setStack(['folders', `folder:${folderId}`]);
        setShowContent(true);
      }),
    [],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F9' && !collapsed && remotes.length > 0) {
        e.preventDefault();
        toggleRail();
        return;
      }
      if (!e.ctrlKey) return;
      if (e.key === 'q') {
        e.preventDefault();
        host.quit();
      } else if (e.key === ',') {
        e.preventDefault();
        setDialog('preferences');
      } else if (e.key === 'n' && selected) {
        e.preventDefault();
        setDialog('add-folder');
      } else if (e.key === 'w') {
        e.preventDefault();
        window.electronAPI.send('window:close');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, collapsed, remotes.length, toggleRail]);

  const breakpoints = useMemo(
    () => [
      {
        condition: { condition: `max-width: ${COLLAPSE_WIDTH}px` },
        onApply: () => setCollapsed(true),
        onUnapply: () => setCollapsed(false),
      },
    ],
    [],
  );

  const mainMenu = useMemo(
    () =>
      buildMainMenu({
        onPreferences: () => setDialog('preferences'),
        onAbout: () => setDialog('about'),
        onQuit: host.quit,
      }),
    [],
  );

  if (error) {
    return (
      <AdwToolbarView
        style={{ height: '100%' }}
        topBars={<AdwHeaderBar titleWidget={<GtkWindowTitle title="Alto" />} />}
        content={
          <AdwStatusPage iconName="DialogError" title="Unknown Error" description={error}>
            <GtkButton label="Quit" className="pill" halign="center" onClicked={host.quit} />
          </AdwStatusPage>
        }
      />
    );
  }

  if (!ready) {
    return (
      <AdwToolbarView
        style={{ height: '100%' }}
        topBars={<AdwHeaderBar titleWidget={<GtkWindowTitle title="Alto" />} />}
        content={<GtkSpinner spinning halign="center" valign="center" style={{ width: 32, height: 32 }} />}
      />
    );
  }

  const sidebarButton = collapsed ? null : (
    <>
      {/* The window buttons at the start of the window (macOS's are) have no
          room in the sidebar narrowed to avatars: they come before it. */}
      {railed && <GtkWindowControls side="start" />}
      <GtkToggleButton
        iconName="SidebarShow"
        hasFrame={false}
        active={!rail}
        tooltipText="Toggle Sidebar"
        onToggled={toggleRail}
      />
    </>
  );

  const content =
    selected === null ? (
      <AdwToolbarView
        style={{ height: '100%' }}
        topBars={<AdwHeaderBar showStartTitleButtons={collapsed} start={sidebarButton} showTitle={false} />}
      />
    ) : (
      <RemoteContent
        key={selected}
        remoteName={selected}
        stack={stack}
        setStack={setStack}
        collapsed={collapsed}
        sidebarButton={sidebarButton}
        onAddFolder={() => setDialog('add-folder')}
      />
    );

  return (
    <>
      {remotes.length === 0 ? (
        // No accounts: logging in to one is the whole window.
        <LoginPage menu={mainMenu} onLoggedIn={select} />
      ) : (
        <AdwBreakpointBin breakpoints={breakpoints} style={{ height: '100%' }}>
          <AdwNavigationSplitView
            style={{ height: '100%' }}
            collapsed={collapsed}
            showContent={showContent && selected !== null}
            onShowContentChanged={setShowContent}
            ref={splitViewRef}
            minSidebarWidth={sidebarMoving || railed ? RAIL_WIDTH : SIDEBAR_MIN_WIDTH}
            maxSidebarWidth={sidebarMoving || railed ? RAIL_WIDTH : SIDEBAR_MAX_WIDTH}
            sidebarWidthFraction={SIDEBAR_FRACTION}
            sidebar={{
              tag: 'sidebar',
              title: 'Alto',
              children: (
                <Sidebar
                  selected={collapsed ? null : selected}
                  showWindowControls={collapsed}
                  rail={railed && !sidebarMoving}
                  moving={sidebarMoving !== null}
                  width={sidebarMoving ? sidebarMoving.full : undefined}
                  onSelect={select}
                  onAddAccount={() => setDialog('login')}
                  onPreferences={() => setDialog('preferences')}
                  onAbout={() => setDialog('about')}
                  onQuit={host.quit}
                />
              ),
            }}
            content={{ tag: 'content', title: selected ?? 'Alto', children: content }}
          />
        </AdwBreakpointBin>
      )}
      <LoginDialog
        visible={dialog === 'login'}
        onClosed={() => setDialog(null)}
        onLoggedIn={(name) => {
          setDialog(null);
          select(name);
        }}
      />
      {selected && (
        <AddFolderDialog
          remote={selected}
          visible={dialog === 'add-folder'}
          onClosed={() => setDialog(null)}
          onAdded={(id) => {
            setDialog(null);
            setStack(['folders', `folder:${id}`]);
          }}
        />
      )}
      <AboutDialog visible={dialog === 'about'} onClosed={() => setDialog(null)} />
      <PreferencesDialog visible={dialog === 'preferences'} onClosed={() => setDialog(null)} />
    </>
  );
}

/** Shows unexpected renderer errors instead of a blank window. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorDialog
          error={{
            message: 'Unknown Error',
            body: 'An unknown error has occurred while running. This is an internal issue with Alto and should be reported.\n\nThe following backtrace may help with debugging the issue - note that it may contain information such as login tokens/keys, so avoid posting the information publicly:',
            detail: `${this.state.error.message}\n\n${this.state.error.stack ?? ''}`,
          }}
          onClose={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

export default function App({ theme }: { theme: Theme }) {
  const [noShadow, setNoShadow] = useState(false);

  useEffect(() => window.electronAPI.onWindowStateChanged(setNoShadow), []);

  return (
    <theme.Provider style={{ height: '100%' }} icons={icons}>
      <AltoProvider client={client}>
        <GtkWindow
          allocateShadow
          draggableRegions
          maximized={noShadow}
          style={{ height: '100%' }}
          // The shadow is the frame's insets: the compositor uses them for the
          // input region, tiling and snapping.
          onShadowWidthChanged={(width) =>
            window.electronAPI.send('window:set-decoration-insets', width, width, width, width)
          }
          onClose={() => window.electronAPI.send('window:close')}
          onMinimize={() => window.electronAPI.send('window:minimize')}
          onMaximize={() => window.electronAPI.send('window:toggle-maximized')}
        >
          <ToastProvider>
            <ErrorBoundary>
              <Shell />
            </ErrorBoundary>
          </ToastProvider>
        </GtkWindow>
      </AltoProvider>
    </theme.Provider>
  );
}
