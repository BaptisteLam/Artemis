import { describe, expect, it } from 'vitest';
import { formatAmount } from './money';

describe('formatAmount', () => {
  it('formats euros in French', () => expect(formatAmount(4900)).toBe('49,00 €'));
  it('uses a true minus sign', () => expect(formatAmount(-4210)).toBe('−42,10 €'));
  it('adds a plus sign on request', () =>
    expect(formatAmount(2499, 'EUR', { sign: true })).toBe('+24,99 €'));
  it('groups thousands', () => expect(formatAmount(129900)).toBe('1 299,00 €'));
});
