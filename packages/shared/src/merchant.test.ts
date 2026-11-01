import { describe, expect, it } from 'vitest';
import { merchantMatches, normalizeMerchant } from './merchant';

describe('merchant', () => {
  it('normalises', () => expect(normalizeMerchant('Notion Labs, Inc.')).toBe('notion'));
  it('matches variants', () => {
    expect(merchantMatches('Notion Labs Inc.', 'Notion')).toBe(true);
    expect(merchantMatches('notion.so', 'Notion')).toBe(true);
    expect(merchantMatches('Amazon', 'Notion')).toBe(false);
  });
  it('never matches an empty pattern', () => expect(merchantMatches('Amazon', '  ')).toBe(false));
});
