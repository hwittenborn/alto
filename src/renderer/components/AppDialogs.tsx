import { useAltoState } from '@alto/react';
import {
  AdwAboutDialog,
  AdwActionRow,
  AdwDialog,
  AdwHeaderBar,
  AdwPreferencesGroup,
  AdwPreferencesPage,
  AdwSwitchRow,
  AdwToolbarView,
  GtkWindowTitle,
} from '@gtk-js/adwaita';
import { useEffect, useState } from 'react';
import type { AppInfo } from '@/ipc-shared';
import { host } from '../ui';

declare const ALTO_VERSION: string;
declare const ALTO_RELEASE_NOTES: string;

export function AboutDialog({ visible, onClosed }: { visible: boolean; onClosed(): void }) {
  const rcloneVersion = useAltoState((s) => s.rcloneVersion);
  return (
    <AdwAboutDialog
      visible={visible}
      onClosed={onClosed}
      onOpenUrl={(url) => void host.openUrl(url)}
      applicationName="Alto"
      applicationIcon="ComHunterwittenbornAlto"
      developerName="Hunter Wittenborn"
      version={ALTO_VERSION}
      comments="Keep your files in sync with the cloud."
      website="https://github.com/hwittenborn/alto"
      supportUrl="https://github.com/hwittenborn/alto/discussions"
      issueUrl="https://github.com/hwittenborn/alto/issues"
      releaseNotes={ALTO_RELEASE_NOTES}
      releaseNotesVersion={ALTO_VERSION}
      debugInfo={`Alto ${ALTO_VERSION}\nrclone ${rcloneVersion ?? 'unknown'}\n${navigator.userAgent}`}
      copyright="© 2022-2026 Hunter Wittenborn"
      licenseType="GPL-3.0-or-later"
      developers={['Hunter Wittenborn https://hunterwittenborn.com']}
      creditSections={[{ name: 'App icons by', people: ['Adrien Facélina'] }]}
      legalSections={[{ title: 'Provider logos', copyright: 'selfh.st/icons', licenseType: 'CC-BY-4.0' }]}
    />
  );
}

export function PreferencesDialog({ visible, onClosed }: { visible: boolean; onClosed(): void }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const rcloneVersion = useAltoState((s) => s.rcloneVersion);

  useEffect(() => {
    if (visible) void host.info().then(setInfo);
  }, [visible]);

  return (
    <AdwDialog visible={visible} title="Preferences" contentWidth={480} contentHeight={460} onClosed={onClosed}>
      <AdwToolbarView
        style={{ height: '100%' }}
        topBars={<AdwHeaderBar titleWidget={<GtkWindowTitle title="Preferences" />} />}
        content={
          <AdwPreferencesPage>
            <AdwPreferencesGroup title="General">
              <AdwSwitchRow
                title="Run in Background"
                subtitle="Start Alto when you log in and keep syncing without a window"
                active={info?.autostart ?? false}
                onActiveChanged={(active) => {
                  void host.setAutostart(active).then((autostart) => setInfo((i) => (i ? { ...i, autostart } : i)));
                }}
              />
            </AdwPreferencesGroup>
            <AdwPreferencesGroup title="rclone">
              <AdwActionRow title="Version" subtitle={rcloneVersion ?? '—'} className="property" />
              <AdwActionRow title="Program" subtitle={info?.rclonePath ?? '—'} className="property" />
              <AdwActionRow
                title="Configuration"
                subtitle={info ? `${info.configDir}/rclone.conf` : '—'}
                className="property"
              />
            </AdwPreferencesGroup>
          </AdwPreferencesPage>
        }
      />
    </AdwDialog>
  );
}
