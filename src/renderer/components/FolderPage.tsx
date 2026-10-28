import {
  describeIssue,
  type FolderView,
  folderStatusText,
  folderTitle,
  lastCheckedText,
  progressBytesText,
  progressCountText,
  progressFraction,
  type SyncIssue,
  validateExclusionPattern,
} from '@alto/core';
import { useAlto, useHomeDir } from '@alto/react';
import {
  AdwActionRow,
  AdwEntryRow,
  AdwPreferencesGroup,
  AdwPreferencesPage,
  GtkButton,
  GtkImage,
  GtkLabel,
  GtkProgressBar,
} from '@gtk-js/adwaita';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNow, useToast } from '../ui';
import { IssueDialog } from './IssueDialog';
import { FolderStatusIcon } from './StatusIcon';

interface PatternRow {
  key: number;
  text: string;
  /** Last applied value ("" for a new, unsaved row). */
  saved: string;
  /** Added by the user just now: focus it. */
  fresh?: boolean;
}

function ExclusionsGroup({ folder }: { folder: FolderView }) {
  const alto = useAlto();
  const toast = useToast();
  const [rows, setRows] = useState<PatternRow[] | null>(null);
  const nextKey = useRef(0);

  useEffect(() => {
    let cancelled = false;
    alto.getExclusions(folder.id).then(
      (patterns) => {
        if (cancelled) return;
        setRows(patterns.map((p) => ({ key: nextKey.current++, text: p, saved: p })));
      },
      // The folder went away (or its .altoignore is unreadable): nothing to edit.
      () => {
        if (!cancelled) setRows([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [alto, folder.id]);

  const save = useCallback(
    async (next: PatternRow[]) => {
      try {
        await alto.setExclusions(
          folder.id,
          next.map((r) => r.saved).filter((p) => p.trim() !== ''),
        );
      } catch (err) {
        toast(`Unable to save the exclusions: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [alto, folder.id, toast],
  );

  if (!rows) return null;

  const update = (key: number, patch: Partial<PatternRow>) =>
    setRows((current) => current?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);
  const errors = rows.map((row) => (row.text === '' ? null : validateExclusionPattern(row.text)));
  const shownError = errors.find(Boolean);

  return (
    <AdwPreferencesGroup
      title="File/Folder Exclusions"
      description="Matching files and folders aren't synced. Patterns use .gitignore syntax (like *.tmp or build/) and are shared with every device syncing this folder."
      headerSuffix={
        <GtkButton
          iconName="ListAdd"
          className="flat"
          tooltipText="Add Exclusion"
          onClicked={() =>
            setRows([
              ...(rows ?? []).filter((r) => r.text !== '' || r.saved !== ''),
              { key: nextKey.current++, text: '', saved: '', fresh: true },
            ])
          }
        />
      }
    >
      {rows.map((row, i) => {
        const error = errors[i];
        return (
          <AdwEntryRow
            key={row.key}
            title="Pattern"
            text={row.text}
            className={error ? 'error' : undefined}
            tooltipText={error ?? undefined}
            showApplyButton={!error && row.text !== row.saved}
            autoFocus={row.fresh}
            data-pattern={row.saved}
            onChanged={(text) => update(row.key, { text })}
            onApply={() => {
              if (error || row.text.trim() === '') return;
              const next = rows.map((r) => (r.key === row.key ? { ...r, saved: r.text } : r));
              setRows(next);
              void save(next);
            }}
            suffixWidget={
              <GtkButton
                iconName="ListRemove"
                className="flat"
                valign="center"
                tooltipText="Remove"
                onClicked={() => {
                  const next = rows.filter((r) => r.key !== row.key);
                  setRows(next);
                  if (row.saved !== '') void save(next);
                }}
              />
            }
          />
        );
      })}
      {shownError && <GtkLabel className="caption error" wrap xalign={0} label={shownError} />}
    </AdwPreferencesGroup>
  );
}

function IssueRow({ issue, folder, onOpen }: { issue: SyncIssue; folder: FolderView; onOpen(): void }) {
  const home = useHomeDir();
  const { title, subtitle } = describeIssue(issue, folder, home);
  const icon = issue.kind === 'error' ? 'DialogError' : 'DialogWarning';
  return (
    <AdwActionRow
      title={title}
      subtitle={subtitle}
      subtitleLines={2}
      activatable
      onActivated={onOpen}
      data-issue={issue.id}
      prefixWidget={<GtkImage iconName={icon} className={issue.kind === 'error' ? 'error' : 'warning'} />}
      suffixWidget={<GtkImage iconName="GoNext" />}
    />
  );
}

function StatusGroup({ folder }: { folder: FolderView }) {
  const now = useNow();
  const { runtime } = folder;
  const progress =
    runtime.phase === 'syncing' && runtime.progress && runtime.progress.total > 0 ? runtime.progress : null;
  const failed = runtime.phase === 'offline' || runtime.phase === 'error';
  const detail = failed
    ? runtime.message
    : progress
      ? progressBytesText(progress)
      : runtime.lastCheckedAt !== null && runtime.phase !== 'checking'
        ? lastCheckedText(runtime.lastCheckedAt, now)
        : null;
  return (
    <AdwPreferencesGroup>
      {/* One line each, so the row keeps its height while the file names change. */}
      <AdwActionRow
        title={folderStatusText(folder)}
        titleLines={1}
        subtitle={detail ?? undefined}
        subtitleLines={failed ? 3 : 1}
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

export function FolderPage({ folder }: { folder: FolderView }) {
  const [openIssue, setOpenIssue] = useState<SyncIssue | null>(null);
  const home = useHomeDir();
  const { local, remote } = folderTitle(folder, home);
  const issues = folder.runtime.issues;

  return (
    <>
      <AdwPreferencesPage>
        <StatusGroup folder={folder} />
        {issues.length > 0 && (
          <AdwPreferencesGroup title="Issues" description="These items need your attention before they can be synced.">
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} folder={folder} onOpen={() => setOpenIssue(issue)} />
            ))}
          </AdwPreferencesGroup>
        )}
        <ExclusionsGroup folder={folder} />
        <AdwPreferencesGroup title="Details">
          <AdwActionRow title="Local folder" subtitle={local} className="property" />
          <AdwActionRow title="Remote folder" subtitle={`${folder.remote}:${remote}`} className="property" />
        </AdwPreferencesGroup>
        {/* AdwPreferencesPage only takes groups: the note is an untitled one, like a footer. */}
        <AdwPreferencesGroup>
          <GtkLabel
            className="caption dim-label"
            wrap
            xalign={0}
            label="Deleted local files are moved to the trash. Files changed on both sides are never overwritten without asking."
          />
        </AdwPreferencesGroup>
      </AdwPreferencesPage>
      {openIssue && <IssueDialog folder={folder} issue={openIssue} onClosed={() => setOpenIssue(null)} />}
    </>
  );
}
