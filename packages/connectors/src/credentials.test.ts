import { describe, expect, it } from 'vitest';
import { decryptCredentials, encryptCredentials, generateConnectionsKey } from './credentials';

describe('credentials', () => {
  it('round-trips', async () => {
    const key = generateConnectionsKey();
    const c = await encryptCredentials({ secretKey: 'sk_test_1' }, key);
    expect(c.startsWith('v1.')).toBe(true);
    expect(c).not.toContain('sk_test_1');
    expect(await decryptCredentials<{ secretKey: string }>(c, key)).toEqual({ secretKey: 'sk_test_1' });
  });
  it('fails with the wrong key', async () => {
    const c = await encryptCredentials({ a: 1 }, generateConnectionsKey());
    await expect(decryptCredentials(c, generateConnectionsKey())).rejects.toThrow();
  });
  it('produces different ciphertexts for the same input', async () => {
    const key = generateConnectionsKey();
    expect(await encryptCredentials({ a: 1 }, key)).not.toBe(await encryptCredentials({ a: 1 }, key));
  });
});
