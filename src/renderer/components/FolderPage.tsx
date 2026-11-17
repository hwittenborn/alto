import {
  baseName,
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
  AdwExpanderRow,
  AdwPreferencesGroup,
  AdwPreferencesPage,
  GtkBox,
  GtkButton,
  GtkImage,
  GtkLabel,
  GtkListBox,
  GtkProgressBar,
  GtkScrolledWindow,
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

function SyncDetails({ folder, expanded }: { folder: FolderView; expanded: boolean }) {
  const now = useNow(expanded ? 1000 : 30_000);
  const { check, progress, message, lastCheckedAt } = folder.runtime;
  const lines: string[] = [];
  if (check) {
    const elapsed = Math.max(0, Math.floor((now - check.startedAt) / 1000));
    lines.push(elapsed < 60 ? `Elapsed: ${elapsed} s` : `Elapsed: ${Math.floor(elapsed / 60)} min ${elapsed % 60} s`);
    if (check.stage === 'preparing') lines.push('Preparing the local folder and contacting the server…');
    if (check.stage === 'changed-paths') lines.push('Checking recently changed paths…');
    if (check.stage === 'listing' || check.stage === 'comparing') {
      for (const [label, count] of [
        ['Local', check.local],
        ['Server', check.remote],
      ] as const) {
        lines.push(
          count
            ? `${label}: ${count.folders.toLocaleString()} folders, ${count.files.toLocaleString()} files`
            : `${label}: listing files and folders…`,
        );
      }
      if (check.stage === 'comparing' && !progress) lines.push('Comparing both listings…');
    }
  }
  if (progress) {
    lines.push(progressCountText(progress));
    const bytes = progressBytesText(progress);
    if (bytes) lines.push(bytes);
  }
  if (message) lines.push(message);
  if (lastCheckedAt !== null) lines.push(lastCheckedText(lastCheckedAt, now));
  if (lines.length === 0) lines.push(folderStatusText(folder));
  const creating = progress?.current.filter(({ op }) => op === 'mkdir-local' || op === 'mkdir-remote') ?? [];
  return (
    <AdwActionRow
      title=""
      data-sync-details={folder.id}
      prefixWidget={
        <GtkBox orientation="vertical" spacing={4}>
          {lines.map((line, index) => (
            <GtkLabel key={index} label={line} className="subtitle dimmed" xalign={0} wrap />
          ))}
          {creating.map(({ op, path }) => (
            <GtkLabel
              key={`${op}:${path}`}
              label={op === 'mkdir-local' ? `Creating ${path}` : `Creating ${path} on the server`}
              data-creating-path
              xalign={0}
              wrap
              wrapMode="word-char"
            />
          ))}
        </GtkBox>
      }
    />
  );
}

function StatusGroup({ folder }: { folder: FolderView }) {
  const [expanded, setExpanded] = useState(false);
  const now = useNow();
  const { runtime } = folder;
  const progress =
    runtime.phase === 'syncing' && runtime.progress && runtime.progress.total > 0 ? runtime.progress : null;
  const firstDirectory = progress?.current.find(({ op }) => op === 'mkdir-local' || op === 'mkdir-remote');
  const creatingFolders =
    progress &&
    progress.current.length > 1 &&
    progress.current.every(({ op }) => op === 'mkdir-local' || op === 'mkdir-remote');
  const failed = runtime.phase === 'offline' || runtime.phase === 'error';
  const detail = failed
    ? runtime.message
    : progress
      ? firstDirectory && progress.current.length > 1
        ? baseName(firstDirectory.path)
        : progressBytesText(progress)
      : runtime.lastCheckedAt !== null && runtime.phase !== 'checking'
        ? lastCheckedText(runtime.lastCheckedAt, now)
        : null;
  return (
    <AdwPreferencesGroup>
      {/* One line each, so the row keeps its height while the file names change. */}
      <AdwExpanderRow
        data-sync-status
        expanded={expanded}
        onExpandedChanged={setExpanded}
        title={creatingFolders ? 'Creating folders' : folderStatusText(folder)}
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
      >
        <SyncDetails folder={folder} expanded={expanded} />
      </AdwExpanderRow>
    </AdwPreferencesGroup>
  );
}

export function FolderPage({ folder }: { folder: FolderView }) {
  const [openIssue, setOpenIssue] = useState<SyncIssue | null>(null);
  const alto = useAlto();
  const toast = useToast();
  const home = useHomeDir();
  const { local, remote } = folderTitle(folder, home);
  const issues = folder.runtime.issues;
  const hasErrors = issues.some((issue) => issue.kind === 'error');

  return (
    <>
      <AdwPreferencesPage>
        <StatusGroup folder={folder} />
        {issues.length > 0 && (
          <AdwPreferencesGroup
            title="Issues"
            description="These items need your attention before they can be synced."
            headerSuffix={
              hasErrors && (
                <GtkButton
                  label="Dismiss All"
                  tooltipText="Dismiss all errors for this folder"
                  valign="center"
                  onClicked={() => {
                    void alto.dismissErrors(folder.id).catch(() => toast('Unable to dismiss errors.'));
                  }}
                />
              )
            }
          >
            <GtkScrolledWindow hscrollbarPolicy="never" propagateNaturalHeight maxContentHeight={320}>
              <GtkListBox className="boxed-list" selectionMode="none">
                {issues.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} folder={folder} onOpen={() => setOpenIssue(issue)} />
                ))}
              </GtkListBox>
            </GtkScrolledWindow>
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
