/**
 * Cloud providers Alto knows how to log in to, and how each maps onto an
 * rclone backend configuration.
 */

export type ProviderId = 'gdrive' | 'dropbox' | 'protondrive' | 'nextcloud' | 'owncloud' | 'webdav';

export type ProviderFieldId = 'url' | 'username' | 'password' | 'totp';

export interface ProviderField {
  id: ProviderFieldId;
  /** Label shown in the UI. */
  label: string;
  kind: 'text' | 'url' | 'password' | 'totp';
  required: boolean;
  defaultValue?: string;
}

export interface ProviderOAuth {
  clientId: string;
  clientSecret: string;
}

export interface ProviderDefinition {
  id: ProviderId;
  /** Display name. */
  label: string;
  /** rclone backend type. */
  rcloneType: string;
  /** "oauth" providers authenticate in the browser; others use the form fields. */
  auth: 'oauth' | 'credentials';
  fields: ProviderField[];
  /** Brand colour used for avatars, as a hex string without `#`. White behind a full-color logo. */
  color: string;
  /** Key of the provider's logo in `LOGOS` (src/renderer/providers.tsx), when it has one. */
  iconSlug?: string;
  /** Generic GTK icon name used when there is no brand icon. */
  fallbackIcon: string;
  oauth?: ProviderOAuth;
}

/** The result of mapping form values onto an rclone remote. */
export interface RcloneRemoteConfig {
  type: string;
  parameters: Record<string, string | boolean>;
  /** Passwords are passed in plain text and obscured by rclone. */
  obscure: boolean;
}

const usernameField: ProviderField = {
  id: 'username',
  label: 'Username',
  kind: 'text',
  required: true,
};
const passwordField: ProviderField = {
  id: 'password',
  label: 'Password',
  kind: 'password',
  required: true,
};
const urlField: ProviderField = { id: 'url', label: 'Server URL', kind: 'url', required: true };

// OAuth client credentials registered for Celeste, which Alto succeeds.
// They are public by design (installed-app OAuth), exactly as in Celeste.
const GDRIVE_OAUTH: ProviderOAuth = {
  clientId: '617798216802-gpgajsc7o768ukbdegk5esa3jf6aekgj.apps.googleusercontent.com',
  clientSecret: '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',
};
const DROPBOX_OAUTH: ProviderOAuth = {
  clientId: 'hke0fgr43viaq03',
  clientSecret: 'o4cpx8trcnneq7a',
};

export const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: 'gdrive',
    label: 'Google Drive',
    rcloneType: 'drive',
    auth: 'oauth',
    fields: [],
    color: 'FFFFFF',
    iconSlug: 'google-drive',
    fallbackIcon: 'folder-remote-symbolic',
    oauth: GDRIVE_OAUTH,
  },
  {
    id: 'dropbox',
    label: 'Dropbox',
    rcloneType: 'dropbox',
    auth: 'oauth',
    fields: [],
    color: '0061FF',
    iconSlug: 'dropbox-light',
    fallbackIcon: 'folder-remote-symbolic',
    oauth: DROPBOX_OAUTH,
  },
  {
    id: 'protondrive',
    label: 'Proton Drive',
    rcloneType: 'protondrive',
    auth: 'credentials',
    fields: [usernameField, passwordField, { id: 'totp', label: '2FA Code', kind: 'totp', required: false }],
    color: 'FFFFFF',
    iconSlug: 'proton-drive',
    fallbackIcon: 'folder-remote-symbolic',
  },
  {
    id: 'nextcloud',
    label: 'Nextcloud',
    rcloneType: 'webdav',
    auth: 'credentials',
    fields: [urlField, usernameField, passwordField],
    color: '0082C9',
    iconSlug: 'nextcloud',
    fallbackIcon: 'folder-remote-symbolic',
  },
  {
    id: 'owncloud',
    label: 'ownCloud',
    rcloneType: 'webdav',
    auth: 'credentials',
    fields: [urlField, usernameField, passwordField],
    color: '041E42',
    iconSlug: 'owncloud-light',
    fallbackIcon: 'folder-remote-symbolic',
  },
  {
    id: 'webdav',
    label: 'WebDAV',
    rcloneType: 'webdav',
    auth: 'credentials',
    fields: [urlField, usernameField, passwordField],
    color: '3584E4',
    fallbackIcon: 'folder-remote-symbolic',
  },
];

const PROVIDER_MAP = new Map(PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id: ProviderId): ProviderDefinition {
  const provider = PROVIDER_MAP.get(id);
  if (!provider) throw new Error(`Unknown provider '${id}'`);
  return provider;
}

export function isProviderId(id: string): id is ProviderId {
  return PROVIDER_MAP.has(id as ProviderId);
}

export type ProviderValues = Partial<Record<ProviderFieldId, string>>;

/** Turn the login form values into an rclone remote configuration. */
export function buildRemoteConfig(id: ProviderId, values: ProviderValues): RcloneRemoteConfig {
  const v = (key: ProviderFieldId) => (values[key] ?? '').trim();
  const provider = getProvider(id);

  switch (id) {
    case 'dropbox':
    case 'gdrive': {
      const parameters: Record<string, string | boolean> = {
        client_id: provider.oauth!.clientId,
        client_secret: provider.oauth!.clientSecret,
        // Let rclone open our callback flow instead of trying xdg-open itself.
        config_auth_no_browser: 'true',
      };
      if (id === 'gdrive') parameters.scope = 'drive';
      return { type: provider.rcloneType, parameters, obscure: true };
    }
    case 'nextcloud':
    case 'owncloud': {
      // Users enter the server's base URL; WebDAV lives below remote.php.
      const base = v('url').replace(/\/+$/, '');
      const user = v('username');
      const url = `${base}/remote.php/dav/files/${encodeURIComponent(user)}`;
      return {
        type: 'webdav',
        parameters: { url, vendor: id, user, pass: values.password ?? '' },
        obscure: true,
      };
    }
    case 'webdav':
      return {
        type: 'webdav',
        parameters: {
          url: v('url'),
          vendor: 'other',
          user: v('username'),
          pass: values.password ?? '',
        },
        obscure: true,
      };
    case 'protondrive': {
      const parameters: Record<string, string | boolean> = {
        username: v('username'),
        password: values.password ?? '',
      };
      if (v('totp') !== '') parameters['2fa'] = v('totp');
      return { type: 'protondrive', parameters, obscure: true };
    }
  }
}

/** Work out which provider an existing rclone remote belongs to. */
export function detectProvider(config: Record<string, string>): ProviderId | null {
  switch (config.type) {
    case 'dropbox':
      return 'dropbox';
    case 'drive':
      return 'gdrive';
    case 'protondrive':
      return 'protondrive';
    case 'webdav':
      if (config.vendor === 'nextcloud') return 'nextcloud';
      if (config.vendor === 'owncloud') return 'owncloud';
      return 'webdav';
    default:
      return null;
  }
}

/** A short human description of the account behind a remote (`alice@cloud.example.com`). */
export function describeAccount(config: Record<string, string>): string | null {
  const host = (url: string | undefined) => {
    if (!url) return null;
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  };
  switch (config.type) {
    case 'webdav': {
      const h = host(config.url);
      if (config.user && h) return `${config.user}@${h}`;
      return h ?? config.user ?? null;
    }
    case 'protondrive':
      return config.username ?? null;
    default:
      return null;
  }
}
