import {
  type FolderView,
  folderStatusText,
  folderTitle,
  formatBytes,
  lastCheckedText,
  progressFraction,
} from '@alto/core';
import { useFolders, useHomeDir, useRemote } from '@alto/react';
import {
  AdwActionRow,
  AdwPreferencesGroup,
  AdwPreferencesPage,
  AdwStatusPage,
  GtkBox,
  GtkButton,
  GtkImage,
  GtkLabel,
  GtkProgressBar,
} from '@gtk-js/adwaita';
import { useNow } from '../ui';
import { FolderStatusIcon } from './StatusIcon';

function FolderRow({ folder, onOpen }: { folder: FolderView; onOpen(): void }) {
  const home = useHomeDir();
  const now = useNow();
  const { local, remote } = folderTitle(folder, home);
  const { phase, progress, lastCheckedAt, issues } = folder.runtime;
  const synced = phase === 'idle' && issues.length === 0 && lastCheckedAt !== null;
  return (
    <AdwActionRow
      // A row's title is only text, so the title and subtitle are drawn here
      // instead, with Adwaita's pan-end arrow between the two folders.
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
              // The check mark says it's synced: the time says how recently.
              label={synced ? lastCheckedText(lastCheckedAt, now) : folderStatusText(folder)}
              className="subtitle dimmed"
              ellipsize="end"
              xalign={0}
            />
          </GtkBox>
        </>
      }
      suffixWidget={
        <>
          {phase === 'syncing' && progress && progress.total > 0 && (
            <GtkProgressBar fraction={progressFraction(progress)} valign="center" className="alto-progress" />
          )}
          <GtkImage iconName="GoNext" />
        </>
      }
    />
  );
}

export function FolderList({
  remoteName,
  onOpenFolder,
  onAddFolder,
}: {
  remoteName: string;
  onOpenFolder(id: string): void;
  onAddFolder(): void;
}) {
  const folders = useFolders(remoteName);
  const remote = useRemote(remoteName);

  if (folders.length === 0) {
    return (
      <AdwStatusPage
        iconName="FolderRemote"
        title="No Synced Folders"
        description={`Pick a folder on this computer to keep in sync with ${remoteName}.`}
      >
        <GtkButton label="Add Folder" className="pill suggested-action" halign="center" onClicked={onAddFolder} />
      </AdwStatusPage>
    );
  }

  const usage = remote?.usage;
  const description =
    usage?.used !== undefined && usage.total
      ? `${formatBytes(usage.used)} of ${formatBytes(usage.total)} used`
      : usage?.used !== undefined
        ? `${formatBytes(usage.used)} used`
        : undefined;

  return (
    <AdwPreferencesPage>
      <AdwPreferencesGroup
        title="Folders"
        description={description}
        headerSuffix={
          <GtkButton iconName="ListAdd" className="flat" tooltipText="Add Folder" onClicked={onAddFolder} />
        }
      >
        {folders.map((folder) => (
          <FolderRow key={folder.id} folder={folder} onOpen={() => onOpenFolder(folder.id)} />
        ))}
      </AdwPreferencesGroup>
    </AdwPreferencesPage>
  );
}
