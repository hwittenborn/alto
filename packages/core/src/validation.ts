import { getProvider, type ProviderFieldId, type ProviderId, type ProviderValues } from './providers.ts';

/** rclone remote names Alto accepts (see the message in `validateRemoteName`). */
const REMOTE_NAME_RE = /^[0-9a-zA-Z_.]([0-9a-zA-Z_. -]*[0-9a-zA-Z_.-])?$/;

/** Validate a remote (server) name. Returns an error message, or null when valid. */
export function validateRemoteName(name: string, existingNames: readonly string[]): string | null {
  if (name === '') return 'A name is required.';
  if (existingNames.includes(name)) return 'Name already exists.';
  if (!REMOTE_NAME_RE.test(name)) {
    return "Invalid name. Names must:\n- Only contain numbers, letters, '_', '-', '.', and spaces\n- Not start with '-' or a space\n- Not end with a space";
  }
  return null;
}

/**
 * Validate a server URL. `disallowDavSuffix` rejects URLs that already
 * include Nextcloud/ownCloud's `/remote.php/...` WebDAV suffix.
 */
export function validateServerUrl(text: string, disallowDavSuffix = false): string | null {
  if (text.trim() === '') return 'A server URL is required.';
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `Invalid server URL (${reason.replace(/^Invalid URL:?\s*/i, '') || 'invalid URL'}).`;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return `Invalid server URL (unknown server scheme ${url.protocol.replace(/:$/, '')}).`;
  }
  if (url.hostname === '') return 'Invalid server URL (no domain specified).';
  if (url.password !== '') return 'Invalid server URL (password was specified).';
  if (disallowDavSuffix) {
    const match = url.pathname.match(/\/remote\.php\/.*/);
    if (match) return `Don't specify '${match[0]}' as part of the URL.`;
  }
  return null;
}

/** Validate a 6-digit TOTP code. Empty is allowed (the field is optional). */
export function validateTotp(code: string): string | null {
  if (code === '') return null;
  if (!/^\d*$/.test(code)) {
    return 'The provided 2FA code is invalid (should only contain digits).';
  }
  if (code.length !== 6) return 'The provided 2FA code is invalid (should be 6 digits long).';
  return null;
}

/**
 * Validate a Jottacloud personal login token: base64url-encoded JSON naming
 * the service to sign in to. Empty is allowed (the browser is used then).
 */
export function validateJottacloudLoginToken(text: string): string | null {
  const token = text.replace(/\s+/g, '');
  if (token === '') return null;
  const invalid = 'This isn’t a personal login token. Copy the whole token, and try again.';
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return invalid;
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (token.length % 4)) % 4);
    const json: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
    const fields = json as { well_known_link?: unknown; auth_token?: unknown } | null;
    if (typeof fields?.well_known_link !== 'string' || typeof fields.auth_token !== 'string') return invalid;
  } catch {
    return invalid;
  }
  return null;
}

export interface LoginFormValidation {
  /** Per-field error messages (only fields with errors are present). */
  errors: Partial<Record<ProviderFieldId | 'name', string>>;
  /** Whether the form can be submitted. */
  valid: boolean;
}

/** Validate a whole login form for a provider. */
export function validateLoginForm(
  providerId: ProviderId,
  name: string,
  values: ProviderValues,
  existingNames: readonly string[],
): LoginFormValidation {
  const provider = getProvider(providerId);
  const errors: LoginFormValidation['errors'] = {};

  const nameError = validateRemoteName(name, existingNames);
  if (nameError) errors.name = nameError;

  for (const field of provider.fields) {
    const value = values[field.id] ?? '';
    let error: string | null = null;
    switch (field.kind) {
      case 'url':
        error = validateServerUrl(value, providerId === 'nextcloud' || providerId === 'owncloud');
        break;
      case 'totp':
        error = validateTotp(value);
        break;
      case 'select':
        if (!field.options?.some((o) => o.value === value)) error = 'Choose one of the options.';
        break;
      default:
        if (field.required && value === '') error = 'This field is required.';
    }
    if (!error && field.id === 'loginToken') error = validateJottacloudLoginToken(value);
    if (error) errors[field.id] = error;
  }

  // A custom OAuth client needs both its ID and its secret. The error goes on
  // the half that was filled in.
  const clientId = (values.clientId ?? '').trim();
  const clientSecret = (values.clientSecret ?? '').trim();
  if (clientId !== '' && clientSecret === '') errors.clientId = 'Enter a client secret to use a custom client.';
  if (clientSecret !== '' && clientId === '') errors.clientSecret = 'Enter a client ID to use a custom client.';

  return { errors, valid: Object.keys(errors).length === 0 };
}
