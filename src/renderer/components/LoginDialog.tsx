import {
  type ActionError,
  getProvider,
  type ProviderDefinition,
  type ProviderFieldId,
  type ProviderId,
  type ProviderValues,
  PROVIDERS,
  validateLoginForm,
} from '@alto/core';
import { useAlto, useAltoState } from '@alto/react';
import {
  AdwActionRow,
  AdwClamp,
  AdwDialog,
  AdwEntryRow,
  AdwHeaderBar,
  AdwNavigationView,
  AdwPasswordEntryRow,
  AdwPreferencesGroup,
  AdwPreferencesPage,
  AdwStatusPage,
  AdwToolbarView,
  GtkBox,
  GtkButton,
  GtkImage,
  GtkLabel,
  GtkMenuButton,
  type GtkMenuModel,
  GtkScrolledWindow,
  GtkSpinner,
  GtkWindowTitle,
} from '@gtk-js/adwaita';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ProviderAvatar } from '../providers';
import { host } from '../ui';
import { ErrorDialog } from './ErrorDialog';

function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!existing.includes(candidate)) return candidate;
  }
}

/** The providers to pick from. Bare, without its title and description, under the login page's welcome. */
function ProviderPicker({ bare, onPick }: { bare?: boolean; onPick(id: ProviderId): void }) {
  return (
    <AdwPreferencesGroup
      title={bare ? undefined : 'Server Type'}
      description={bare ? undefined : 'Choose where the files you want to sync are stored.'}
    >
      {PROVIDERS.map((p) => (
        <AdwActionRow
          key={p.id}
          title={p.label}
          subtitle={p.auth === 'oauth' ? 'Sign in with your browser' : 'Sign in with a password'}
          activatable
          onActivated={() => onPick(p.id)}
          data-provider={p.id}
          prefixWidget={<ProviderAvatar provider={p.id} size={32} />}
          suffixWidget={<GtkImage iconName="GoNext" />}
        />
      ))}
    </AdwPreferencesGroup>
  );
}

/**
 * What goes on a button that starts a Google Drive login: Google's branding
 * requires its "G" and a Sign in with Google label there.
 */
function GoogleSignIn() {
  return (
    <GtkBox spacing={8}>
      <GtkImage iconName="GoogleG" pixelSize={16} valign="center" />
      <GtkLabel label="Sign in with Google" />
    </GtkBox>
  );
}

function fieldRow(
  field: ProviderDefinition['fields'][number],
  values: ProviderValues,
  setValue: (id: ProviderFieldId, value: string) => void,
  error: string | undefined,
  onSubmit: () => void,
) {
  const value = values[field.id] ?? '';
  const common = {
    title: field.label,
    className: error ? 'error' : undefined,
    tooltipText: error,
    'data-field': field.id,
  };
  switch (field.kind) {
    case 'password':
      return (
        <AdwPasswordEntryRow
          key={field.id}
          {...common}
          text={value}
          onChanged={(t) => setValue(field.id, t)}
          onEntryActivated={onSubmit}
        />
      );
    default:
      return (
        <AdwEntryRow
          key={field.id}
          {...common}
          text={value}
          inputPurpose={field.kind === 'url' ? 'url' : field.kind === 'totp' ? 'digits' : 'free-form'}
          onChanged={(t) => setValue(field.id, t)}
          onEntryActivated={onSubmit}
        />
      );
  }
}

/** Without accounts, the login is the window's page: the main menu, and a welcome above the providers. */
interface WelcomeProps {
  menu: GtkMenuModel;
}

/** Signing in to an account: a provider, its form, and the browser for OAuth providers. */
function LoginFlow({
  welcome,
  onLoggedIn,
  onFailed,
}: {
  welcome?: WelcomeProps;
  onLoggedIn(name: string): void;
  onFailed(error: ActionError): void;
}) {
  const alto = useAlto();
  const remoteNames = useAltoState((s) => s.remotes.map((r) => r.name));
  const logins = useAltoState((s) => s.logins);
  const [stack, setStack] = useState<string[]>(['providers']);
  const [providerId, setProviderId] = useState<ProviderId>('dropbox');
  const [name, setName] = useState('');
  const [values, setValues] = useState<ProviderValues>({});
  const [busy, setBusy] = useState(false);
  // The accounts there were when the form opened: the one it adds mustn't count against its own name.
  const [takenNames, setTakenNames] = useState<string[]>([]);

  const provider = getProvider(providerId);
  const google = providerId === 'gdrive';
  const validation = useMemo(
    () => validateLoginForm(providerId, name.trim(), values, takenNames),
    [providerId, name, values, takenNames],
  );
  const login = logins.find((l) => l.name === name.trim());

  // A browser login still going when the flow goes away (its dialog closed) is cancelled.
  const pending = useRef<string | null>(null);
  pending.current = login && ['starting', 'waiting', 'verifying'].includes(login.status) ? login.name : null;
  useEffect(
    () => () => {
      if (pending.current) void alto.cancelLogin(pending.current);
    },
    [alto],
  );

  const pick = (id: ProviderId) => {
    const def = getProvider(id);
    setProviderId(id);
    setTakenNames(remoteNames);
    setName(uniqueName(def.label, remoteNames));
    setValues(Object.fromEntries(def.fields.filter((f) => f.defaultValue).map((f) => [f.id, f.defaultValue])));
    setStack(['providers', 'form']);
  };

  const submit = async () => {
    if (!validation.valid || busy) return;
    setBusy(true);
    if (provider.auth === 'oauth') setStack(['providers', 'form', 'browser']);
    const result =
      provider.auth === 'oauth'
        ? await alto.loginWithBrowser({ provider: providerId, name: name.trim() })
        : await alto.createRemote({ provider: providerId, name: name.trim(), values });
    setBusy(false);
    if (result.ok) {
      onLoggedIn(result.value.name);
      return;
    }
    if (provider.auth === 'oauth') setStack(['providers', 'form']);
    if (result.error.code !== 'cancelled') {
      onFailed(result.error);
    }
  };

  // Fields aren't flagged until they're filled in; the first problem is also
  // spelled out below them.
  const nameError = name !== '' ? validation.errors.name : undefined;
  const fieldErrors = provider.fields.map((f) => ((values[f.id] ?? '') !== '' ? validation.errors[f.id] : undefined));
  const shownError = [nameError, ...fieldErrors].find(Boolean);

  const formPage = (
    <AdwToolbarView
      style={{ height: '100%' }}
      topBars={<AdwHeaderBar titleWidget={<GtkWindowTitle title={provider.label} />} />}
      content={
        <GtkScrolledWindow hscrollbarPolicy="never" style={{ height: '100%' }}>
          <AdwClamp maximumSize={440}>
            <GtkBox orientation="vertical" spacing={24} valign="center" className="alto-dialog-content">
              <GtkBox orientation="vertical" spacing={12} halign="center">
                <ProviderAvatar provider={providerId} size={64} />
                <GtkLabel
                  className="dim-label"
                  wrap
                  justify="center"
                  label={
                    provider.auth === 'oauth'
                      ? `Alto will open your browser so you can sign in to ${provider.label}.`
                      : `Enter the details of your ${provider.label} account.`
                  }
                />
              </GtkBox>
              <AdwPreferencesGroup>
                <AdwEntryRow
                  title="Name"
                  text={name}
                  className={nameError ? 'error' : undefined}
                  tooltipText={nameError}
                  data-field="name"
                  onChanged={setName}
                  onEntryActivated={submit}
                />
                {provider.fields.map((field, i) =>
                  fieldRow(
                    field,
                    values,
                    (id, v) => setValues((current) => ({ ...current, [id]: v })),
                    fieldErrors[i],
                    submit,
                  ),
                )}
              </AdwPreferencesGroup>
              {shownError && <GtkLabel className="caption error" wrap xalign={0} label={shownError} />}
              <GtkButton
                className={google ? 'pill' : 'pill suggested-action'}
                halign="center"
                disabled={!validation.valid || busy}
                onClicked={submit}
                data-action="login"
              >
                <GtkBox spacing={6}>
                  {busy && <GtkSpinner spinning valign="center" />}
                  {google ? <GoogleSignIn /> : <GtkLabel label={busy ? 'Logging in…' : 'Log in'} />}
                </GtkBox>
              </GtkButton>
            </GtkBox>
          </AdwClamp>
        </GtkScrolledWindow>
      }
    />
  );

  const browserPage = (
    <AdwToolbarView
      style={{ height: '100%' }}
      topBars={<AdwHeaderBar showBackButton={false} titleWidget={<GtkWindowTitle title={provider.label} />} />}
      content={
        <AdwStatusPage
          title={`Authenticating to ${provider.label}…`}
          description={
            login?.status === 'verifying'
              ? 'Checking the connection…'
              : "Follow the link that opened in your browser, and come back once you've finished."
          }
        >
          <GtkBox orientation="vertical" spacing={12} halign="center">
            <GtkSpinner spinning halign="center" style={{ width: 32, height: 32 }} />
            {login?.authUrl &&
              (google ? (
                <GtkButton className="pill" halign="center" onClicked={() => void host.openUrl(login.authUrl!)}>
                  <GoogleSignIn />
                </GtkButton>
              ) : (
                <GtkButton
                  label="Open Link Again"
                  className="pill"
                  halign="center"
                  onClicked={() => void host.openUrl(login.authUrl!)}
                />
              ))}
            <GtkButton
              label="Cancel"
              className="pill"
              halign="center"
              onClicked={() => {
                if (login) void alto.cancelLogin(login.name);
              }}
            />
          </GtkBox>
        </AdwStatusPage>
      }
    />
  );

  const providersPage = welcome ? (
    <AdwToolbarView
      style={{ height: '100%' }}
      topBars={
        <AdwHeaderBar
          showTitle={false}
          end={
            <GtkMenuButton
              iconName="OpenMenu"
              hasFrame={false}
              primary
              menuModel={welcome.menu}
              tooltipText="Main Menu"
            />
          }
        />
      }
      content={
        <AdwPreferencesPage>
          <GtkBox orientation="vertical" spacing={12} halign="center">
            <GtkImage iconName="ComHunterwittenbornAlto" pixelSize={96} />
            <GtkBox orientation="vertical" spacing={6}>
              <GtkLabel className="title-1" label="Welcome to Alto" wrap justify="center" />
              <GtkLabel className="dim-label" label="Let's get set up." wrap justify="center" />
            </GtkBox>
          </GtkBox>
          <ProviderPicker bare onPick={pick} />
        </AdwPreferencesPage>
      }
    />
  ) : (
    <AdwToolbarView
      style={{ height: '100%' }}
      topBars={<AdwHeaderBar titleWidget={<GtkWindowTitle title="Add Account" />} />}
      content={
        <AdwPreferencesPage>
          <ProviderPicker onPick={pick} />
        </AdwPreferencesPage>
      }
    />
  );

  return (
    <AdwNavigationView
      stack={stack}
      onStackChange={setStack}
      style={{ height: '100%' }}
      pages={[
        { tag: 'providers', title: welcome ? 'Alto' : 'Add Account', children: providersPage },
        { tag: 'form', title: provider.label, children: formPage },
        { tag: 'browser', title: provider.label, canPop: false, children: browserPage },
      ]}
    />
  );
}

/** The login as the window's page, when there are no accounts yet. */
export function LoginPage({ menu, onLoggedIn }: { menu: GtkMenuModel; onLoggedIn(name: string): void }) {
  const [failure, setFailure] = useState<ActionError | null>(null);
  return (
    <>
      <LoginFlow welcome={{ menu }} onLoggedIn={onLoggedIn} onFailed={setFailure} />
      <ErrorDialog error={failure} onClose={() => setFailure(null)} />
    </>
  );
}

/** Adding another account. */
export function LoginDialog({
  visible,
  onClosed,
  onLoggedIn,
}: {
  visible: boolean;
  onClosed(): void;
  onLoggedIn(name: string): void;
}) {
  // A fresh flow each time, once the dialog has animated out, so it doesn't navigate back while closing.
  const [flow, setFlow] = useState(0);
  const [failure, setFailure] = useState<ActionError | null>(null);
  return (
    <>
      <AdwDialog
        visible={visible}
        title="Add Account"
        contentWidth={440}
        contentHeight={620}
        onClosed={onClosed}
        onHidden={() => setFlow((n) => n + 1)}
      >
        <LoginFlow key={flow} onLoggedIn={onLoggedIn} onFailed={setFailure} />
      </AdwDialog>
      <ErrorDialog error={failure} onClose={() => setFailure(null)} />
    </>
  );
}
