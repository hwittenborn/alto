/**
 * The website's Alto window: the desktop app's look (the same GTK-JS widgets,
 * and the app's own provider avatars), trimmed to what the homepage shows.
 * Accounts arrive by the page's floating avatars sliding into the sidebar
 * (src/lib/slide-in.ts), each with its folders; the first to arrive is shown.
 *
 * An account's row is in the sidebar, hidden, from the moment its avatar sets
 * off, so the avatar flies to exactly where its row's avatar is. It's shown
 * once the avatar lands (`alto-demo:arrived`).
 */
import {
  type AltoClient,
  baseName,
  type FolderView,
  folderStatusIcon,
  folderStatusText,
  formatBytes,
  folderTitle,
  lastCheckedText,
  progressBytesText,
  progressCountText,
  progressFraction,
  type RemoteView,
  type FolderProgress,
} from '@alto/core';
import { AltoProvider, useFolder, useFolders, useHomeDir, useRemoteActivity, useRemotes } from '@alto/react';
import {
  AdwActionRow,
  AdwaitaProvider,
  AdwBreakpointBin,
  AdwHeaderBar,
  AdwNavigationSplitView,
  AdwNavigationView,
  AdwPreferencesGroup,
  AdwPreferencesPage,
  AdwStatusPage,
  AdwToolbarView,
  GtkBox,
  GtkImage,
  GtkLabel,
  GtkListBox,
  GtkListBoxRow,
  GtkProgressBar,
  GtkScrolledWindow,
  GtkSpinner,
  GtkWindow,
  GtkWindowTitle,
} from '@gtk-js/adwaita';
import { createGtkIconFromSvg } from '@gtk-js/icon-helpers';
import * as adwaitaIcons from '@gtk-js/icons-adwaita';
import { FolderStatusIcon } from './FolderStatusIcon';
import { ProviderAvatar } from './ProviderAvatar';
import appIconSvg from '../assets/app-icon.svg?raw';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

const icons = {
  ...adwaitaIcons,
  ComHunterwittenbornAlto: createGtkIconFromSvg('ComHunterwittenbornAlto', appIconSvg),
};

/** As the app: below this width the split view collapses into a single pane. */
const COLLAPSE_WIDTH = 640;

/** Fills its parent's height. */
const FILL = { height: '100%' };

/** The current time, every 30s: for "Last synced 2 minutes ago". */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** A folder's sync progress, while it's syncing something. */
function activeProgress(folder: FolderView): FolderProgress | null {
  const { phase, progress } = folder.runtime;
  return phase === 'syncing' && progress && progress.total > 0 ? progress : null;
}

/** The accounts whose avatars have landed (and not left again), in the order they did. */
function useArrived(): string[] {
  const [arrived, setArrived] = useState<string[]>([]);
  useEffect(() => {
    const onArrived = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      setArrived((current) => (current.includes(name) ? current : [...current, name]));
    };
    // Its avatar has left it again (Restart).
    const onDeparted = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      setArrived((current) => current.filter((n) => n !== name));
    };
    const onReset = () => setArrived([]);
    window.addEventListener('alto-demo:arrived', onArrived);
    window.addEventListener('alto-demo:departed', onDeparted);
    window.addEventListener('alto-demo:reset', onReset);
    return () => {
      window.removeEventListener('alto-demo:arrived', onArrived);
      window.removeEventListener('alto-demo:departed', onDeparted);
      window.removeEventListener('alto-demo:reset', onReset);
    };
  }, []);
  return arrived;
}

/** An account in the sidebar, as the app has it (Sidebar.tsx): avatar, name, address, activity. */
function AccountRow({ remote }: { remote: RemoteView }) {
  const activity = useRemoteActivity(remote.name);
  return (
    <GtkBox spacing={12} className="alto-remote-row">
      {remote.provider && <ProviderAvatar provider={remote.provider} />}
      <GtkBox
        orientation="vertical"
        spacing={2}
        hexpand
        valign="center"
        className="alto-full-only"
        style={{ minWidth: 0 }}
      >
        <GtkLabel label={remote.name} xalign={0} ellipsize="end" className="alto-remote-name" />
        <GtkLabel label={remote.account ?? ''} xalign={0} ellipsize="end" className="caption dim-label" />
      </GtkBox>
      {activity.busy && <GtkSpinner spinning className="alto-full-only" />}
    </GtkBox>
  );
}

/** A folder's sync status, as the app's folder page has it (FolderPage.tsx). */
function StatusGroup({ folder }: { folder: FolderView }) {
  const now = useNow();
  const { runtime } = folder;
  const progress = activeProgress(folder);
  const detail = progress
    ? progressBytesText(progress)
    : runtime.lastCheckedAt !== null && runtime.phase !== 'checking'
      ? lastCheckedText(runtime.lastCheckedAt, now)
      : null;
  return (
    <AdwPreferencesGroup>
      <AdwActionRow
        title={folderStatusText(folder)}
        titleLines={1}
        subtitle={detail ?? undefined}
        subtitleLines={1}
        prefixWidget={<FolderStatusIcon folder={folder} />}
        suffixWidget={
          progress && (
            <GtkProgressBar
              fraction={progressFraction(progress)}
              showText
              text={progressCountText(progress)}
              valign="center"
              className="alto-progress"
            />
          )
        }
      />
    </AdwPreferencesGroup>
  );
}

/** A folder in an account's list, as the app has it (FolderList.tsx): local › remote, and how it's doing. */
function FolderRow({ folder, onOpen }: { folder: FolderView; onOpen(): void }) {
  const home = useHomeDir();
  const now = useNow();
  const { local, remote } = folderTitle(folder, home);
  const { lastCheckedAt } = folder.runtime;
  const progress = activeProgress(folder);
  return (
    <AdwActionRow
      title=""
      activatable
      onActivated={onOpen}
      data-folder={folder.id}
      prefixWidget={
        <>
          <FolderStatusIcon folder={folder} />
          <GtkBox orientation="vertical" spacing={3} valign="center">
            <GtkBox spacing={6}>
              <GtkLabel label={local} ellipsize="middle" xalign={0} />
              <GtkImage iconName="PanEnd" valign="baseline-center" />
              <GtkLabel label={remote} ellipsize="middle" xalign={0} />
            </GtkBox>
            <GtkLabel
              label={
                folderStatusIcon(folder) === 'synced' && lastCheckedAt !== null
                  ? lastCheckedText(lastCheckedAt, now)
                  : folderStatusText(folder)
              }
              className="subtitle dimmed"
              ellipsize="end"
              xalign={0}
            />
          </GtkBox>
        </>
      }
      suffixWidget={
        <>
          {progress && (
            <GtkProgressBar fraction={progressFraction(progress)} valign="center" className="alto-progress" />
          )}
          <GtkImage iconName="GoNext" />
        </>
      }
    />
  );
}

/** A folder's page: its status and where it syncs. */
function FolderPage({ id, collapsed }: { id: string; collapsed: boolean }) {
  const home = useHomeDir();
  const folder = useFolder(id);
  if (!folder) return null;
  const { local, remote } = folderTitle(folder, home);
  return (
    <AdwToolbarView
      style={FILL}
      topBars={
        <AdwHeaderBar
          showStartTitleButtons={collapsed}
          titleWidget={
            <GtkWindowTitle title={baseName(folder.localPath) || local} subtitle={`${folder.remote}:${remote}`} />
          }
        />
      }
      content={
        <AdwPreferencesPage>
          <StatusGroup folder={folder} />
          <AdwPreferencesGroup title="Details">
            <AdwActionRow title="Local folder" subtitle={local} className="property" />
            <AdwActionRow title="Remote folder" subtitle={`${folder.remote}:${remote}`} className="property" />
          </AdwPreferencesGroup>
        </AdwPreferencesPage>
      }
    />
  );
}

/** An account: its folders, as the app lists them, each opening its own page. */
function AccountContent({ remote, collapsed }: { remote: RemoteView; collapsed: boolean }) {
  const folders = useFolders(remote.name);
  const [stack, setStack] = useState<string[]>(['folders']);
  const usage = remote.usage;
  const description =
    usage?.used !== undefined && usage.total
      ? `${formatBytes(usage.used)} of ${formatBytes(usage.total)} used`
      : undefined;
  const pages = [
    {
      tag: 'folders',
      title: remote.name,
      children: (
        <AdwToolbarView
          style={FILL}
          topBars={
            <AdwHeaderBar
              showStartTitleButtons={collapsed}
              titleWidget={<GtkWindowTitle title={remote.name} subtitle={remote.account ?? undefined} />}
            />
          }
          content={
            <AdwPreferencesPage>
              <AdwPreferencesGroup title="Folders" description={description}>
                {folders.map((folder) => (
                  <FolderRow key={folder.id} folder={folder} onOpen={() => setStack(['folders', folder.id])} />
                ))}
              </AdwPreferencesGroup>
            </AdwPreferencesPage>
          }
        />
      ),
    },
    ...folders.map((folder) => ({
      tag: folder.id,
      title: baseName(folder.localPath),
      children: <FolderPage id={folder.id} collapsed={collapsed} />,
    })),
  ];
  return <AdwNavigationView pages={pages} stack={stack} onStackChange={setStack} style={FILL} />;
}

function Shell() {
  const remotes = useRemotes();
  const arrived = useArrived();
  const [picked, setPicked] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showContent, setShowContent] = useState(false);
  // Back on the welcome once they've all gone (Restart).
  useEffect(() => {
    if (arrived.length === 0) setShowContent(false);
  }, [arrived.length]);

  // The first account to arrive, unless another (still here) has been clicked.
  const selected = (picked && arrived.includes(picked) ? picked : arrived[0]) ?? null;
  const remote = remotes.find((r) => r.name === selected) ?? null;
  const selectedIndex = remotes.findIndex((r) => r.name === selected);

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

  const sidebar = (
    <AdwToolbarView
      className="alto-sidebar"
      style={FILL}
      topBars={<AdwHeaderBar showEndTitleButtons={collapsed} titleWidget={<GtkWindowTitle title="Alto" />} />}
      content={
        <GtkScrolledWindow hscrollbarPolicy="never" style={FILL}>
          <GtkListBox
            className="navigation-sidebar"
            selectionMode="single"
            selectedRows={!collapsed && selectedIndex >= 0 ? [selectedIndex] : []}
            onRowActivated={(index) => {
              const remote = remotes[index];
              if (!remote || !arrived.includes(remote.name)) return;
              setPicked(remote.name);
              setShowContent(true);
            }}
          >
            {remotes.map((remote) => (
              <GtkListBoxRow
                key={remote.name}
                data-remote={remote.name}
                data-arrived={arrived.includes(remote.name) ? '' : undefined}
              >
                <AccountRow remote={remote} />
              </GtkListBoxRow>
            ))}
          </GtkListBox>
        </GtkScrolledWindow>
      }
    />
  );

  const content: ReactNode = remote ? (
    <AccountContent key={remote.name} remote={remote} collapsed={collapsed} />
  ) : (
    <AdwToolbarView
      style={FILL}
      topBars={<AdwHeaderBar showStartTitleButtons={collapsed} showTitle={false} />}
      content={
        <AdwStatusPage
          iconName="ComHunterwittenbornAlto"
          // The app's own welcome, as it greets you without accounts (LoginDialog.tsx).
          title="Welcome to Alto"
          description="Let's get set up."
          className="compact"
        />
      }
    />
  );

  return (
    <AdwBreakpointBin breakpoints={breakpoints} style={FILL}>
      <AdwNavigationSplitView
        style={FILL}
        collapsed={collapsed}
        showContent={collapsed && showContent && remote !== null}
        onShowContentChanged={setShowContent}
        minSidebarWidth={240}
        maxSidebarWidth={300}
        sidebarWidthFraction={0.3}
        sidebar={{ tag: 'sidebar', title: 'Alto', children: sidebar }}
        content={{ tag: 'content', title: selected ?? 'Alto', children: content }}
      />
    </AdwBreakpointBin>
  );
}

/** The window, with `children` (the page's floating avatars) in its GTK scope. */
export default function DemoApp({ client, children }: { client: AltoClient; children?: ReactNode }) {
  return (
    <AdwaitaProvider style={FILL} icons={icons}>
      <AltoProvider client={client}>
        {/* Its window buttons do nothing: there's no window to close. */}
        <GtkWindow allocateShadow style={FILL} onClose={() => {}} onMinimize={() => {}} onMaximize={() => {}}>
          <Shell />
        </GtkWindow>
        {children}
      </AltoProvider>
    </AdwaitaProvider>
  );
}
