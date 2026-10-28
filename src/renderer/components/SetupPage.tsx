import { formatBytes } from '@alto/core';
import {
  AdwHeaderBar,
  AdwStatusPage,
  AdwToolbarView,
  GtkBox,
  GtkButton,
  GtkLabel,
  GtkProgressBar,
} from '@gtk-js/adwaita';
import type { HTMLAttributes, ReactNode } from 'react';
import type { SetupState } from '@/ipc-shared';

type PageProps = HTMLAttributes<HTMLDivElement>;

/** A full-window page before the app: a header bar for the window controls. Other props go to its root, as a stack page's must. */
function StartPage({ children, ...rest }: PageProps & { children: ReactNode }) {
  return (
    <AdwToolbarView
      {...rest}
      style={{ height: '100%' }}
      topBars={<AdwHeaderBar showTitle={false} />}
      content={children}
    />
  );
}

/** The first page without accounts. */
export function WelcomePage({ onContinue, ...rest }: PageProps & { onContinue(): void }) {
  return (
    <StartPage {...rest}>
      <AdwStatusPage
        iconName="ComHunterwittenbornAlto"
        title="Welcome to Alto"
        description="Keep folders on this computer in sync with Google Drive, Dropbox, Proton Drive, Nextcloud, ownCloud and WebDAV."
      >
        <GtkButton
          label="Get Started"
          className="pill suggested-action"
          halign="center"
          data-action="get-started"
          onClicked={onContinue}
        />
      </AdwStatusPage>
    </StartPage>
  );
}

/** Shown while Alto downloads what it needs to run, before it can start. */
export function SetupPage({ state, ...rest }: PageProps & { state: SetupState }) {
  const progress = state.phase === 'downloading' ? state : { received: 0, total: null };
  return (
    <StartPage {...rest}>
      {state.phase === 'failed' ? (
        <AdwStatusPage
          iconName="DialogError"
          title="Unable to Set Up Alto"
          description="Alto couldn't download its setup files. Check your internet connection and try again."
        >
          <GtkBox orientation="vertical" spacing={24} halign="center">
            <GtkLabel className="caption dim-label" label={state.message} wrap selectable />
            <GtkButton
              label="Try Again"
              className="pill suggested-action"
              halign="center"
              onClicked={() => window.electronAPI.send('app:retry-setup')}
            />
          </GtkBox>
        </AdwStatusPage>
      ) : (
        <AdwStatusPage
          iconName="ComHunterwittenbornAlto"
          title="Setting Up Alto"
          description="Alto needs to download setup files before continuing."
        >
          <GtkBox orientation="vertical" spacing={6} halign="center" style={{ width: 300 }}>
            <GtkProgressBar fraction={progress.total ? progress.received / progress.total : 0} />
            <GtkLabel
              className="caption dim-label numeric"
              label={
                progress.total
                  ? `${formatBytes(progress.received)} of ${formatBytes(progress.total)}`
                  : formatBytes(progress.received)
              }
            />
          </GtkBox>
        </AdwStatusPage>
      )}
    </StartPage>
  );
}
