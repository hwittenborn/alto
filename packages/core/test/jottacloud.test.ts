import { describe, expect, it } from 'vitest';
import { buildRemoteConfig, describeAccount, detectProvider, signsInWithBrowser } from '../src/providers.ts';
import { validateLoginForm } from '../src/validation.ts';

/** A login token shaped like the ones Jottacloud's web interface generates. */
const loginToken = Buffer.from(
  JSON.stringify({
    username: 'alice',
    realm: 'jottacloud',
    well_known_link: 'https://id.jottacloud.com/auth/realms/jottacloud/.well-known/openid-configuration',
    auth_token: 'secret',
  }),
).toString('base64url');

describe('Jottacloud', () => {
  it('signs in with the browser, on the chosen service', () => {
    expect(signsInWithBrowser('jottacloud', { service: 'telia_se' })).toBe(true);
    const { type, parameters } = buildRemoteConfig('jottacloud', { service: 'telia_se' });
    expect(type).toBe('jottacloud');
    expect(parameters).toEqual({
      config_type: 'traditional',
      config_traditional: 'telia_se',
      config_non_standard: 'false',
      config_auth_no_browser: 'true',
    });
  });

  it('defaults to Jottacloud itself', () => {
    expect(buildRemoteConfig('jottacloud', {}).parameters.config_traditional).toBe('jottacloud');
  });

  it('trades in a personal login token without the browser', () => {
    const values = { service: 'jottacloud', loginToken: ` ${loginToken}\n` };
    expect(signsInWithBrowser('jottacloud', values)).toBe(false);
    expect(buildRemoteConfig('jottacloud', values).parameters).toEqual({
      config_type: 'standard',
      config_login_token: loginToken,
      config_non_standard: 'false',
    });
  });

  it('checks the login token and the service', () => {
    const validate = (values: Record<string, string>) => validateLoginForm('jottacloud', 'Jotta', values, []);
    expect(validate({ service: 'jottacloud' }).valid).toBe(true);
    expect(validate({ service: 'jottacloud', loginToken }).valid).toBe(true);
    expect(validate({ service: 'jottacloud', loginToken: 'not a token' }).errors).toHaveProperty('loginToken');
    expect(validate({ service: 'jottacloud', loginToken: 'bm90IGpzb24' }).errors).toHaveProperty('loginToken');
    expect(validate({ service: 'nowhere' }).errors).toHaveProperty('service');
  });

  it('recognizes existing remotes, and names partner services', () => {
    expect(detectProvider({ type: 'jottacloud' })).toBe('jottacloud');
    const tokenURL = (h: string) => `https://${h}/auth/realms/x/protocol/openid-connect/token`;
    expect(describeAccount({ type: 'jottacloud', tokenURL: tokenURL('cloud-auth.telia.se') })).toBe('Telia (Sweden)');
    expect(describeAccount({ type: 'jottacloud', tokenURL: tokenURL('id.jottacloud.com') })).toBeNull();
  });
});
