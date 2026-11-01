import { describe, expect, it } from 'vitest';
import { parseRequestCardInput } from './schemas';
import { ArtemisError } from './errors';

describe('parseRequestCardInput', () => {
  it('accepts the Notion example and defaults currency', () => {
    const r = parseRequestCardInput({ amount: 4900, merchant: 'Notion', purpose: 'abonnement équipe' });
    expect(r.currency).toBe('EUR');
    expect(r.amount).toBe(4900);
  });
  it.each([49.9, '49', -5, 0])('rejects non-integer amount with cents hint (%s)', (amount) => {
    try {
      parseRequestCardInput({ amount, merchant: 'Notion', purpose: 'x' });
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ArtemisError);
      expect((e as ArtemisError).code).toBe('invalid_amount');
      expect((e as ArtemisError).message).toContain('centimes');
    }
  });
  it('rejects missing merchant as invalid_input', () => {
    expect(() => parseRequestCardInput({ amount: 100, purpose: 'x' })).toThrowError(ArtemisError);
  });
});
