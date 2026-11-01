import { describe, expect, it } from 'vitest';
import { generateAgentToken, sha256Hex } from './crypto';

describe('crypto', () => {
  it('hashes sha256', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('generates agent tokens', async () => {
    const t = await generateAgentToken('test');
    expect(t.token.startsWith('art_test_')).toBe(true);
    expect(t.hash).not.toBe(t.token);
    expect(t.hash).toHaveLength(64);
    expect(t.prefix).toBe(t.token.slice(0, 12));
    expect(await sha256Hex(t.token)).toBe(t.hash);
  });
});
