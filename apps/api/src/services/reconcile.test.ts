import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';

const request = { amount_cents: 4900, merchant: 'Notion' } as never;

describe('reconcile', () => {
  it('matches an exact purchase at a merchant variant', () =>
    expect(reconcile({ amount_cents: 4900, merchant_name: 'Notion Labs', status: 'posted' } as never, request)).toBe('matched'));
  it('flags an amount above the mandate', () =>
    expect(reconcile({ amount_cents: 5200, merchant_name: 'Notion', status: 'posted' } as never, request)).toBe('mismatch'));
  it('flags another merchant', () =>
    expect(reconcile({ amount_cents: 4900, merchant_name: 'Amazon', status: 'posted' } as never, request)).toBe('mismatch'));
  it('accepts a lower amount at the right merchant', () =>
    expect(reconcile({ amount_cents: 4500, merchant_name: 'NOTION.SO', status: 'posted' } as never, request)).toBe('matched'));
  it('leaves declined transactions unmatched', () =>
    expect(reconcile({ amount_cents: 4900, merchant_name: 'Notion', status: 'declined' } as never, request)).toBe('unmatched'));
});
