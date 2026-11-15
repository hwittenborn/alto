/**
 * Cloud providers Alto knows how to log in to, and how each maps onto an
 * rclone backend configuration.
 */

export type ProviderId =
  'gdrive' | 'dropbox' | 'onedrive' | 'jottacloud' | 'protondrive' | 'nextcloud' | 'owncloud' | 'webdav';

export type ProviderFieldId =
  'url' | 'username' | 'password' | 'totp' | 'clientId' | 'clientSecret' | 'service' | 'loginToken';

/** One of the choices of a `select` field. */
export interface ProviderFieldOption {
  value: string;
  label: string;
}

export interface ProviderField {
  id: ProviderFieldId;
  /** Label shown in the UI. */
  label: string;
  kind: 'text' | 'url' | 'password' | 'totp' | 'select';
  required: boolean;
  defaultValue?: string;
  /** The choices of a `select` field. */
  options?: readonly ProviderFieldOption[];
  /** Shown under the form's Advanced options, collapsed by default. */
  advanced?: boolean;
}

export interface ProviderOAuth {
  clientId: string;
  clientSecret: string;
  /** How to make your own OAuth client for the provider. */
  customClientHelpUrl: string;
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
  /**
   * The heading of the form's Advanced options, when it isn't about a custom
   * OAuth client (which `oauth` providers get by default).
   */
  advancedHelp?: ProviderAdvancedHelp;
}

export interface ProviderAdvancedHelp {
  title: string;
  /** Shown under the title, followed by a link to `url`. */
  description: string;
  url: string;
  linkLabel: string;
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
/**
 * An OAuth client of the user's own, in place of Alto's: for getting around
 * rate limits on Alto's, or for organizations that only allow approved clients.
 */
const oauthClientFields: ProviderField[] = [
  { id: 'clientId', label: 'Client ID', kind: 'text', required: false, advanced: true },
  { id: 'clientSecret', label: 'Client Secret', kind: 'password', required: false, advanced: true },
];

// OAuth client credentials registered for Celeste, which Alto succeeds.
// They are public by design (installed-app OAuth), exactly as in Celeste.
const GDRIVE_OAUTH: ProviderOAuth = {
  clientId: '617798216802-gpgajsc7o768ukbdegk5esa3jf6aekgj.apps.googleusercontent.com',
  clientSecret: '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',
  customClientHelpUrl: 'https://rclone.org/drive/#making-your-own-client-id',
};
const DROPBOX_OAUTH: ProviderOAuth = {
  clientId: 'hke0fgr43viaq03',
  clientSecret: 'o4cpx8trcnneq7a',
  customClientHelpUrl: 'https://rclone.org/dropbox/#get-your-own-dropbox-app-id',
};
// Alto's own Azure app.
const ONEDRIVE_OAUTH: ProviderOAuth = {
  clientId: 'c8b7f60d-f36f-46f7-b003-cf9814592623',
  clientSecret: 'jVd8Q~PZvqes4tHQPMLOPmuLfQvlLfMtEdjhVbDh',
  customClientHelpUrl: 'https://rclone.org/onedrive/#getting-your-own-client-id-and-key',
};

/**
 * Jottacloud and the services that run on it under another brand, by the key
 * rclone knows each by (`getServices` in rclone's jottacloud backend). Each
 * has its own sign-in page; the API behind them is the same.
 */
export const JOTTACLOUD_SERVICES: readonly (ProviderFieldOption & { authHost: string })[] = [
  { value: 'jottacloud', label: 'Jottacloud', authHost: 'id.jottacloud.com' },
  { value: 'elgiganten_dk', label: 'Elgiganten Cloud (Denmark)', authHost: 'cloud.elgiganten.dk' },
  { value: 'elgiganten_se', label: 'Elgiganten Cloud (Sweden)', authHost: 'cloud.elgiganten.se' },
  { value: 'elkjop', label: 'Elkjøp Cloud (Norway)', authHost: 'cloud.elkjop.no' },
  { value: 'elko', label: 'ELKO Cloud (Iceland)', authHost: 'cloud.elko.is' },
  { value: 'gigantti', label: 'Gigantti Cloud (Finland)', authHost: 'cloud.gigantti.fi' },
  { value: 'letsgo', label: "Let's Go Cloud (Germany)", authHost: 'letsgo.jotta.cloud' },
  { value: 'mediamarkt', label: 'MediaMarkt Cloud', authHost: 'mediamarkt.jottacloud.com' },
  { value: 'onlime', label: 'Onlime (Denmark)', authHost: 'cloud-auth.onlime.dk' },
  { value: 'phonero', label: 'Phonero Sky', authHost: 'sky.phonero.no' },
  { value: 'tele2', label: 'Tele2 Cloud (Sweden)', authHost: 'mittcloud-auth.tele2.se' },
  { value: 'telia_no', label: 'Telia Sky (Norway)', authHost: 'sky-auth.telia.no' },
  { value: 'telia_se', label: 'Telia Cloud (Sweden)', authHost: 'cloud-auth.telia.se' },
];

export const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: 'gdrive',
    label: 'Google Drive',
    rcloneType: 'drive',
    auth: 'oauth',
    fields: oauthClientFields,
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
    fields: oauthClientFields,
    color: '0061FF',
    iconSlug: 'dropbox-light',
    fallbackIcon: 'folder-remote-symbolic',
    oauth: DROPBOX_OAUTH,
  },
  {
    id: 'onedrive',
    label: 'OneDrive',
    rcloneType: 'onedrive',
    auth: 'oauth',
    fields: oauthClientFields,
    color: 'FFFFFF',
    iconSlug: 'microsoft-onedrive',
    fallbackIcon: 'folder-remote-symbolic',
    oauth: ONEDRIVE_OAUTH,
  },
  {
    id: 'jottacloud',
    label: 'Jottacloud',
    rcloneType: 'jottacloud',
    // Signs in with the browser, unless a personal login token is given (see
    // `signsInWithBrowser`).
    auth: 'oauth',
    fields: [
      {
        id: 'service',
        label: 'Service',
        kind: 'select',
        required: true,
        defaultValue: 'jottacloud',
        options: JOTTACLOUD_SERVICES.map(({ value, label }) => ({ value, label })),
      },
      { id: 'loginToken', label: 'Personal Login Token', kind: 'password', required: false, advanced: true },
    ],
    color: '7D5FE6',
    iconSlug: 'jottacloud',
    fallbackIcon: 'folder-remote-symbolic',
    advancedHelp: {
      title: 'Login Token',
      description:
        'Sign in with a personal login token from your account’s security settings instead of your browser. ' +
        'This lets you stay signed in to Jottacloud’s own apps on this computer too.',
      url: 'https://www.jottacloud.com/web/secure',
      linkLabel: 'Generate a token',
    },
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

/**
 * Whether logging in with these form values goes through the browser. A
 * Jottacloud personal login token is traded in for the account's token
 * directly, so it doesn't.
 */
export function signsInWithBrowser(id: ProviderId, values: ProviderValues = {}): boolean {
  if (id === 'jottacloud' && (values.loginToken ?? '').trim() !== '') return false;
  return getProvider(id).auth === 'oauth';
}

/** Turn the login form values into an rclone remote configuration. */
export function buildRemoteConfig(id: ProviderId, values: ProviderValues): RcloneRemoteConfig {
  const v = (key: ProviderFieldId) => (values[key] ?? '').trim();
  const provider = getProvider(id);

  switch (id) {
    case 'dropbox':
    case 'gdrive':
    case 'onedrive': {
      // A custom client is used only when both halves of it are given (validation requires that).
      const custom = v('clientId') !== '' && v('clientSecret') !== '';
      const parameters: Record<string, string | boolean> = {
        client_id: custom ? v('clientId') : provider.oauth!.clientId,
        client_secret: custom ? v('clientSecret') : provider.oauth!.clientSecret,
        // Let rclone open our callback flow instead of trying xdg-open itself.
        config_auth_no_browser: 'true',
      };
      if (id === 'gdrive') parameters.scope = 'drive';
      // Alto only syncs the account's own drive, so it doesn't ask to browse
      // SharePoint sites (Sites.Read.All): one less permission for an
      // organization to approve. Without a form to pick from, rclone chooses
      // "OneDrive Personal or Business" and the account's drive.
      if (id === 'onedrive') parameters.disable_site_permission = 'true';
      return { type: provider.rcloneType, parameters, obscure: true };
    }
    case 'jottacloud': {
      // These answer the questions of rclone's jottacloud config: which kind
      // of login ("standard" trades in a personal login token, "traditional"
      // signs in with the browser), and whether to use another device and
      // mountpoint than the standard Jotta/Archive (no: that's what
      // Jottacloud's own apps show as the account's files). They aren't
      // stored in the remote.
      const token = v('loginToken').replace(/\s+/g, '');
      const parameters: Record<string, string | boolean> = { config_non_standard: 'false' };
      if (token !== '') {
        parameters.config_type = 'standard';
        parameters.config_login_token = token;
      } else {
        parameters.config_type = 'traditional';
        parameters.config_traditional = v('service') || 'jottacloud';
        // Let rclone open our callback flow instead of trying xdg-open itself.
        parameters.config_auth_no_browser = 'true';
      }
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
    case 'onedrive':
      return 'onedrive';
    case 'jottacloud':
      return 'jottacloud';
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
    case 'jottacloud': {
      // The token URL is on the service's own sign-in host: name the service
      // when it's one of Jottacloud's partners.
      const h = host(config.tokenURL);
      const service = JOTTACLOUD_SERVICES.find((s) => s.authHost === h);
      return service && service.value !== 'jottacloud' ? service.label : null;
    }
    default:
      return null;
  }
}
