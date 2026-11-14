import { describe, expect, it } from 'vitest';
import { buildRemoteConfig, getProvider } from '../src/providers.ts';
import { validateLoginForm } from '../src/validation.ts';

describe('custom OAuth clients', () => {
  it("uses Alto's own client by default", () => {
    const { parameters } = buildRemoteConfig('gdrive', {});
    expect(parameters.client_id).toBe(getProvider('gdrive').oauth!.clientId);
    expect(parameters.client_secret).toBe(getProvider('gdrive').oauth!.clientSecret);
  });

  it('uses the client given in the form', () => {
    const { parameters } = buildRemoteConfig('dropbox', { clientId: ' my-id ', clientSecret: 'my-secret' });
    expect(parameters).toMatchObject({ client_id: 'my-id', client_secret: 'my-secret' });
  });

  it('needs both the client ID and secret, or neither', () => {
    const validate = (values: Record<string, string>) => validateLoginForm('gdrive', 'Drive', values, []);
    expect(validate({}).valid).toBe(true);
    expect(validate({ clientId: 'id', clientSecret: 'secret' }).valid).toBe(true);
    expect(validate({ clientId: 'id' }).errors).toHaveProperty('clientId');
    expect(validate({ clientSecret: 'secret' }).errors).toHaveProperty('clientSecret');
  });
});
