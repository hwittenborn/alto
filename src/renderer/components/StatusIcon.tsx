import { type FolderView, folderStatusIcon } from '@alto/core';
import { GtkImage, GtkSpinner } from '@gtk-js/adwaita';

const ICONS: Record<string, { icon: string; className?: string }> = {
  awaiting: { icon: 'ContentLoading', className: 'dim-label' },
  synced: { icon: 'ObjectSelect', className: 'success' },
  warning: { icon: 'DialogWarning', className: 'warning' },
  offline: { icon: 'NetworkOffline', className: 'dim-label' },
  error: { icon: 'DialogError', className: 'error' },
  paused: { icon: 'MediaPlaybackPause', className: 'dim-label' },
};

/** The status indicator shown in front of a synced folder. */
export function FolderStatusIcon({ folder }: { folder: FolderView }) {
  const status = folderStatusIcon(folder);
  if (status === 'syncing') {
    return <GtkSpinner spinning className="alto-status-icon" />;
  }
  const { icon, className } = ICONS[status];
  return <GtkImage iconName={icon} className={`alto-status-icon ${className ?? ''}`} />;
}
