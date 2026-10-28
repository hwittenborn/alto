import type { RemoteView } from '@alto/core';

import { useRemoteActivity, useRemotes } from '@alto/react';
import {
  AdwHeaderBar,
  AdwToolbarView,
  GtkBox,
  GtkButton,
  GtkImage,
  GtkLabel,
  GtkListBox,
  GtkListBoxRow,
  GtkMenuButton,
  type GtkMenuModel,
  GtkOverlay,
  GtkScrolledWindow,
  GtkSpinner,
  GtkWindowTitle,
} from '@gtk-js/adwaita';
import { ProviderAvatar, providerLabel } from '../providers';

/** What an account is up to: syncing, needing attention, or offline. `badge`: in an avatar's corner. */
function ActivityIcon({ name, badge = false }: { name: string; badge?: boolean }) {
  const activity = useRemoteActivity(name);
  const place = badge
    ? ({ halign: 'end', valign: 'end', className: 'alto-rail-badge alto-rail-only' } as const)
    : { className: 'alto-full-only' };
  if (activity.busy) return <GtkSpinner spinning {...place} />;
  if (activity.issues > 0) {
    return <GtkImage iconName="DialogWarning" {...place} className={`warning ${place.className ?? ''}`} />;
  }
  if (activity.offline) {
    return <GtkImage iconName="NetworkOffline" {...place} className={`dim-label ${place.className ?? ''}`} />;
  }
  return null;
}

/**
 * An account: its avatar, then (in the full sidebar) its name and what it's
 * up to. Narrowed to avatars, what it's up to is a badge on the avatar
 * instead. The avatar is in the same place either way, so it stays put
 * while the sidebar moves between them; moving, the badge is there too,
 * for the movement to fade in or out (`.alto-rail-only`, `.alto-full-only`).
 */
function RemoteRow({ remote, rail, moving }: { remote: RemoteView; rail: boolean; moving: boolean }) {
  const subtitle = remote.account ?? providerLabel(remote.provider);
  return (
    <GtkBox spacing={12} className="alto-remote-row">
      <GtkOverlay
        child={<ProviderAvatar provider={remote.provider} size={36} />}
        overlays={rail || moving ? [<ActivityIcon key="activity" name={remote.name} badge />] : []}
      />
      {!rail && (
        // minWidth: a flex item can't shrink below its content, where GTK's
        // minimum for ellipsizing labels is about an ellipsis.
        <GtkBox
          orientation="vertical"
          spacing={2}
          hexpand
          valign="center"
          className="alto-full-only"
          style={{ minWidth: 0 }}
        >
          <GtkLabel label={remote.name} xalign={0} ellipsize="end" className="alto-remote-name" />
          <GtkLabel label={subtitle} xalign={0} ellipsize="end" className="caption dim-label" />
        </GtkBox>
      )}
      {!rail && <ActivityIcon name={remote.name} />}
    </GtkBox>
  );
}

/** The primary menu (in the sidebar, or the login page without accounts). */
export function buildMainMenu(actions: { onPreferences(): void; onAbout(): void; onQuit(): void }): GtkMenuModel {
  return [
    [{ label: 'Preferences', accel: 'Ctrl+,', onActivate: actions.onPreferences }],
    [
      { label: 'About Alto', onActivate: actions.onAbout },
      { label: 'Quit', accel: 'Ctrl+Q', onActivate: actions.onQuit },
    ],
  ];
}

export interface SidebarProps {
  selected: string | null;
  showWindowControls: boolean;
  /** Narrowed to the accounts' avatars, their names in tooltips. */
  rail: boolean;
  /**
   * Moving over the content, between full and narrowed: drawn with the
   * pane's background and edge, laid out full, with what only the narrow
   * one shows too.
   */
  moving?: boolean;
  /** A fixed width (px) for the content, clipped by a narrower sidebar: while it's moving. */
  width?: number;
  onSelect(name: string): void;
  onAddAccount(): void;
  onPreferences(): void;
  onAbout(): void;
  onQuit(): void;
}

export function Sidebar({
  selected,
  showWindowControls,
  rail,
  moving,
  width,
  onSelect,
  onAddAccount,
  onPreferences,
  onAbout,
  onQuit,
}: SidebarProps) {
  const remotes = useRemotes();
  const selectedIndex = remotes.findIndex((r) => r.name === selected);

  const menu = buildMainMenu({ onPreferences, onAbout, onQuit });
  const menuButton = (
    <GtkMenuButton iconName="OpenMenu" hasFrame={false} primary menuModel={menu} tooltipText="Main Menu" />
  );

  return (
    // The clip doesn't count its content's width as its own minimum, so the sidebar can narrow past it.
    <div className={moving ? 'alto-sidebar-clip moving' : 'alto-sidebar-clip'} style={moving ? { width } : undefined}>
      <AdwToolbarView
        className={rail ? 'alto-sidebar rail' : 'alto-sidebar'}
        style={{ height: '100%', width }}
        topBars={
          rail ? (
            // Only room for one button: the main menu. Adding an account is the list's last row.
            <AdwHeaderBar showStartTitleButtons={false} showEndTitleButtons={false} titleWidget={menuButton} />
          ) : (
            <AdwHeaderBar
              showEndTitleButtons={showWindowControls}
              titleWidget={<GtkWindowTitle title="Alto" />}
              start={
                <GtkButton iconName="ListAdd" hasFrame={false} tooltipText="Add Account" onClicked={onAddAccount} />
              }
              end={menuButton}
            />
          )
        }
        content={
          <GtkScrolledWindow hscrollbarPolicy="never" style={{ height: '100%' }}>
            <GtkListBox
              className="navigation-sidebar"
              selectionMode="single"
              selectedRows={selectedIndex >= 0 ? [selectedIndex] : []}
              onRowActivated={(index) => {
                const remote = remotes[index];
                if (remote) onSelect(remote.name);
                else onAddAccount();
              }}
            >
              {remotes.map((remote) => (
                <GtkListBoxRow key={remote.name} data-remote={remote.name} tooltipText={rail ? remote.name : undefined}>
                  <RemoteRow remote={remote} rail={rail} moving={!!moving} />
                </GtkListBoxRow>
              ))}
              {(rail || moving) && (
                <GtkListBoxRow selectable={false} tooltipText="Add Account" className="alto-rail-only">
                  {/* Lined up with the avatars, so it's centered in the narrow sidebar. */}
                  <GtkBox className="alto-add-row">
                    <GtkImage iconName="ListAdd" valign="center" />
                  </GtkBox>
                </GtkListBoxRow>
              )}
            </GtkListBox>
          </GtkScrolledWindow>
        }
      />
    </div>
  );
}
