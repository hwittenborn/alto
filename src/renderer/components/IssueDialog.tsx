import {
  type ActionError,
  baseName,
  conflictText,
  type FolderView,
  formatBytes,
  type ItemState,
  type SyncIssue,
} from '@alto/core';
import { useAlto } from '@alto/react';
import { AdwAlertDialog, type AdwAlertDialogResponse, GtkBox, GtkLabel } from '@gtk-js/adwaita';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../ui';
import { ErrorDialog } from './ErrorDialog';

function describeItem(item: ItemState | null): string {
  if (!item) return 'Missing';
  if (item.isDir) return 'Folder';
  const when = new Date(item.mtime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return `${formatBytes(item.size)}, modified ${when}`;
}

/** Dialogs to resolve one sync issue: conflicts, errors and mass deletions. */
export function IssueDialog({ folder, issue, onClosed }: { folder: FolderView; issue: SyncIssue; onClosed(): void }) {
  const alto = useAlto();
  const toast = useToast();
  const [states, setStates] = useState<{ local: ItemState | null; remote: ItemState | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ActionError | null>(null);
  // Closing animates the visible dialog out; the parent unmounts us after.
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);
  const hidden = useCallback(() => {
    if (!open) onClosed();
  }, [open, onClosed]);

  // Conflicts: look at both items again first — the conflict may have
  // resolved itself since it was detected.
  useEffect(() => {
    if (issue.kind !== 'conflict') return;
    let cancelled = false;
    void (async () => {
      const current = await alto.inspectConflict(folder.id, issue.path).catch(() => null);
      if (cancelled) return;
      if (current && (!current.local || !current.remote)) {
        const result = await alto.resolveConflict(folder.id, issue.path, 'local');
        if (cancelled) return;
        if (result.ok) {
          toast(
            result.value.outcome === 'gone'
              ? 'Neither the local item nor the remote item exists anymore. This error will now be removed.'
              : result.value.outcome === 'local-only'
                ? 'Only the local item exists now, so it will be synced to the remote.'
                : 'Only the remote item exists now, so it will be synced to the local machine.',
          );
          onClosed();
        } else {
          setFailure(result.error);
        }
        return;
      }
      setStates(current ?? { local: issue.local, remote: issue.remote });
    })();
    return () => {
      cancelled = true;
    };
  }, [alto, folder.id, issue, onClosed, toast]);

  const errorDialog = <ErrorDialog error={open ? failure : null} onClose={close} onHidden={hidden} />;
  const showing = open && failure === null;

  if (issue.kind === 'error') {
    return (
      <AdwAlertDialog
        visible={showing}
        onHidden={hidden}
        heading="Dismiss Error?"
        body={`${issue.message}\n\nIt's shown again if it happens on the next sync.`}
        responses={[
          { id: 'cancel', label: 'Cancel' },
          { id: 'dismiss', label: 'Dismiss', appearance: 'suggested' },
        ]}
        defaultResponse="dismiss"
        closeResponse="cancel"
        onResponse={(id) => {
          if (id === 'dismiss') void alto.dismissIssue(folder.id, issue.id);
          close();
        }}
      />
    );
  }

  if (issue.kind === 'mass-deletion') {
    const here = issue.side === 'local';
    return (
      <AdwAlertDialog
        visible={showing}
        onHidden={hidden}
        heading={here ? `Delete ${issue.count} files on this computer?` : `Delete ${issue.count} files on the server?`}
        body={
          here
            ? `${issue.count} of ${issue.total} synced files were deleted on the server. Delete them here as well, or restore them on the server?`
            : `${issue.count} of ${issue.total} synced files were deleted on this computer. Delete them on the server as well, or restore them here?`
        }
        responses={[
          { id: 'cancel', label: 'Cancel' },
          { id: 'restore', label: 'Restore' },
          { id: 'delete', label: 'Delete', appearance: 'destructive' },
        ]}
        defaultResponse="restore"
        closeResponse="cancel"
        onResponse={(id) => {
          if (id === 'delete' || id === 'restore') {
            void alto.resolveMassDeletion(folder.id, issue.side, id);
            toast(id === 'delete' ? 'Deleting files…' : 'Restoring files…');
          }
          close();
        }}
      />
    );
  }

  // Conflict
  if (!states) return errorDialog;
  const bothFiles = states.local && !states.local.isDir && states.remote && !states.remote.isDir;
  // Keeping both loses nothing, so it's the default when it's possible.
  const responses: AdwAlertDialogResponse[] = [
    { id: 'cancel', label: 'Cancel', enabled: !busy },
    { id: 'remote', label: 'Keep Remote', enabled: !busy },
    { id: 'local', label: 'Keep Local', enabled: !busy },
    ...(bothFiles ? [{ id: 'both', label: 'Keep Both', enabled: !busy, appearance: 'suggested' as const }] : []),
  ];

  return (
    <>
      <AdwAlertDialog
        visible={showing}
        onHidden={hidden}
        preferWideLayout
        heading="Choose Which Version to Keep"
        body={conflictText(issue.reason, baseName(issue.path))}
        extraChild={
          <GtkBox orientation="vertical" spacing={6}>
            <GtkLabel className="caption" xalign={0} wrap label={`Local: ${describeItem(states.local)}`} />
            <GtkLabel className="caption" xalign={0} wrap label={`Remote: ${describeItem(states.remote)}`} />
            {bothFiles && (
              <GtkLabel
                className="caption dim-label"
                xalign={0}
                wrap
                label="“Keep Both” renames the local file, so both versions are kept on both sides."
              />
            )}
          </GtkBox>
        }
        responses={responses}
        defaultResponse={bothFiles ? 'both' : 'cancel'}
        closeResponse="cancel"
        onResponse={(id) => {
          if (id !== 'local' && id !== 'remote' && id !== 'both') {
            close();
            return;
          }
          setBusy(true);
          void alto.resolveConflict(folder.id, issue.path, id).then((result) => {
            setBusy(false);
            if (result.ok) {
              toast(
                result.value.conflictCopy
                  ? `Saved your version as '${result.value.conflictCopy}'`
                  : `Kept the ${id === 'local' ? 'local' : 'remote'} version of '${issue.path}'`,
              );
              close();
            } else {
              setFailure(result.error);
            }
          });
        }}
      />
      {errorDialog}
    </>
  );
}
