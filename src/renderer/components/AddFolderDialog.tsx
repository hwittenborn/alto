import { type ActionError, baseName, joinPath, normalizeRemotePath, parentPath } from '@alto/core';
import { useAlto } from '@alto/react';
import {
  AdwActionRow,
  AdwAlertDialog,
  AdwDialog,
  AdwEntryRow,
  AdwHeaderBar,
  AdwPreferencesGroup,
  AdwToolbarView,
  GtkBox,
  GtkButton,
  GtkImage,
  GtkLabel,
  GtkSpinner,
  GtkStack,
  GtkStackPage,
  GtkWindowTitle,
} from '@gtk-js/adwaita';
import { useEffect, useMemo, useRef, useState } from 'react';
import { host, useToast } from '../ui';
import { ErrorDialog } from './ErrorDialog';

/** Split "/Documents/Wo" into the folder being browsed ("Documents") and the partial name ("Wo"). */
function splitRemoteInput(text: string): { dir: string; partial: string } {
  const trimmed = text.replace(/^\/+/, '');
  if (trimmed === '' || trimmed.endsWith('/')) return { dir: normalizeRemotePath(trimmed), partial: '' };
  return { dir: parentPath(trimmed), partial: baseName(trimmed) };
}

export function AddFolderDialog({
  remote,
  visible,
  onClosed,
  onAdded,
}: {
  remote: string;
  visible: boolean;
  onClosed(): void;
  onAdded(id: string): void;
}) {
  const alto = useAlto();
  const toast = useToast();
  const [localPath, setLocalPath] = useState('');
  const [remoteText, setRemoteText] = useState('/');
  const [listing, setListing] = useState<{ dir: string; names: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ActionError | null>(null);
  // The name for a new remote folder, while asking for one.
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const requestRef = useRef(0);

  const { dir, partial } = splitRemoteInput(remoteText);

  // Fetch the subfolders of the folder being typed, to suggest as completions.
  useEffect(() => {
    if (!visible) return;
    if (listing?.dir === dir) return;
    const id = ++requestRef.current;
    setLoading(true);
    void alto.listRemoteFolders(remote, dir).then((names) => {
      if (id !== requestRef.current) return;
      setListing({ dir, names });
      setLoading(false);
    });
  }, [alto, remote, dir, visible, listing?.dir]);

  const suggestions = useMemo(() => {
    if (!listing || listing.dir !== dir) return [];
    const lower = partial.toLowerCase();
    return listing.names.filter((n) => n.toLowerCase().startsWith(lower) && n !== partial).slice(0, 8);
  }, [listing, dir, partial]);

  const reset = () => {
    setLocalPath('');
    setRemoteText('/');
    setListing(null);
    setBusy(false);
  };

  // The fields reset once the dialog has animated out (onHidden), so it
  // doesn't change size while closing.
  const close = () => onClosed();

  // A remote folder that doesn't exist yet is created.
  const submit = async () => {
    if (localPath.trim() === '' || busy) return;
    setBusy(true);
    const result = await alto.addFolder({ remote, localPath, remotePath: remoteText });
    setBusy(false);
    if (result.ok) {
      toast(`Syncing '${baseName(localPath.trim())}'`);
      onAdded(result.value.id);
      return;
    }
    setFailure(result.error);
  };

  // New folders go in the one being browsed, like GTK's file chooser's.
  const newFolderName = newFolder?.trim() ?? '';
  const newFolderError = newFolderName.includes('/')
    ? "Folder names can't contain “/”."
    : listing?.dir === dir && listing.names.includes(newFolderName)
      ? 'A folder with that name already exists.'
      : null;
  const createFolder = async () => {
    if (newFolderName === '' || newFolderError) return;
    const result = await alto.createRemoteFolder(remote, joinPath(dir, newFolderName));
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    setListing(null);
    setRemoteText(`/${result.value.path}/`);
  };
  const canSubmit = localPath.trim() !== '' && remoteText.trim() !== '' && !busy;

  return (
    <>
      {/* The remote folder suggestions load after it opens: let it grow with them. */}
      <AdwDialog
        visible={visible}
        title="Add Folder"
        contentWidth={460}
        followsContentSize
        onClosed={close}
        onHidden={reset}
      >
        <AdwToolbarView
          topBars={
            <AdwHeaderBar
              showStartTitleButtons={false}
              showEndTitleButtons={false}
              titleWidget={<GtkWindowTitle title="Add Folder" subtitle={remote} />}
              start={<GtkButton label="Cancel" onClicked={close} />}
              end={
                <GtkButton
                  className="suggested-action text-button"
                  disabled={!canSubmit}
                  onClicked={() => void submit()}
                  data-action="add-folder"
                >
                  {/* A homogeneous stack keeps the button's width while busy. */}
                  <GtkStack visibleChildName={busy ? 'busy' : 'label'}>
                    <GtkStackPage name="label">
                      <GtkLabel label="Add" />
                    </GtkStackPage>
                    <GtkStackPage name="busy">
                      <GtkSpinner spinning halign="center" valign="center" />
                    </GtkStackPage>
                  </GtkStack>
                </GtkButton>
              }
            />
          }
          content={
            <GtkBox orientation="vertical" spacing={24} className="alto-dialog-content">
              <AdwPreferencesGroup title="Local folder" description="The folder on this computer to keep in sync.">
                <AdwEntryRow
                  title="Folder"
                  text={localPath}
                  data-field="local"
                  onChanged={setLocalPath}
                  onEntryActivated={() => void submit()}
                  suffixWidget={
                    <GtkButton
                      iconName="FolderOpen"
                      className="flat"
                      valign="center"
                      tooltipText="Choose a Folder"
                      onClicked={() => {
                        void host.selectFolder(localPath || undefined).then((path) => {
                          if (!path) return;
                          setLocalPath(path);
                          if (normalizeRemotePath(remoteText) === '') setRemoteText(`/${baseName(path)}`);
                        });
                      }}
                    />
                  }
                />
              </AdwPreferencesGroup>
              <AdwPreferencesGroup
                title="Remote folder"
                description={`The folder on ${remote} to keep it in sync with.`}
                headerSuffix={
                  <GtkBox spacing={6}>
                    {loading && <GtkSpinner spinning valign="center" />}
                    <GtkButton
                      iconName="FolderNew"
                      className="flat"
                      valign="center"
                      tooltipText="New Folder"
                      data-action="new-folder"
                      onClicked={() => setNewFolder('')}
                    />
                  </GtkBox>
                }
              >
                <AdwEntryRow
                  title="Folder"
                  text={remoteText}
                  data-field="remote"
                  onChanged={(t) => setRemoteText(t.startsWith('/') ? t : `/${t}`)}
                  onEntryActivated={() => void submit()}
                />
                {suggestions.map((name) => (
                  <AdwActionRow
                    key={name}
                    title={name}
                    activatable
                    data-suggestion={name}
                    onActivated={() => setRemoteText(`/${joinPath(dir, name)}/`)}
                    prefixWidget={<GtkImage iconName="Folder" />}
                    suffixWidget={<GtkImage iconName="GoNext" />}
                  />
                ))}
              </AdwPreferencesGroup>
            </GtkBox>
          }
        />
      </AdwDialog>
      <AdwAlertDialog
        visible={newFolder !== null}
        heading="New Folder"
        body={`In '/${dir}' on ${remote}.`}
        extraChild={
          <GtkBox orientation="vertical" spacing={6}>
            <AdwPreferencesGroup>
              <AdwEntryRow
                title="Folder Name"
                text={newFolder ?? ''}
                className={newFolderError ? 'error' : undefined}
                data-field="new-folder-name"
                onChanged={setNewFolder}
                onEntryActivated={() => {
                  if (newFolderName === '' || newFolderError) return;
                  setNewFolder(null);
                  void createFolder();
                }}
              />
            </AdwPreferencesGroup>
            {newFolderError && <GtkLabel className="caption error" wrap xalign={0} label={newFolderError} />}
          </GtkBox>
        }
        responses={[
          { id: 'cancel', label: 'Cancel' },
          {
            id: 'create',
            label: 'Create',
            appearance: 'suggested',
            enabled: newFolderName !== '' && newFolderError === null,
          },
        ]}
        defaultResponse="create"
        closeResponse="cancel"
        onResponse={(id) => {
          setNewFolder(null);
          if (id === 'create') void createFolder();
        }}
      />
      <ErrorDialog error={failure} onClose={() => setFailure(null)} />
    </>
  );
}
