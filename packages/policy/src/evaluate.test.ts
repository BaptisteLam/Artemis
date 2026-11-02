import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, evaluate, type Policy } from './evaluate';

const p = (o: Partial<Policy> = {}): Policy => ({ ...DEFAULT_POLICY, ...o });
const r = (o: Partial<{ amountCents: number; currency: string; merchant: string; mcc?: string }> = {}) => ({
  amountCents: 4900,
  currency: 'EUR',
  merchant: 'Notion',
  ...o,
});
const code = (d: ReturnType<typeof evaluate>) => (d.kind === 'reject' ? d.code : d.kind);

describe('evaluate', () => {
  it('defaults', () => {
    expect(DEFAULT_POLICY.monthlyBudgetCents).toBe(50000);
    expect(DEFAULT_POLICY.perTxLimitCents).toBe(10000);
    expect(DEFAULT_POLICY.currencies).toEqual(['EUR']);
    expect(DEFAULT_POLICY.cardTtlMinutes).toBe(30);
  });
  it('currency_not_allowed', () => expect(code(evaluate(p(), r({ currency: 'USD' }), 0))).toBe('currency_not_allowed'));
  it('invalid_amount for zero', () => expect(code(evaluate(p(), r({ amountCents: 0 }), 0))).toBe('invalid_amount'));
  it('over_transaction_limit', () => expect(code(evaluate(p(), r({ amountCents: 10001 }), 0))).toBe('over_transaction_limit'));
  it('amount equal to the limit is accepted', () => expect(code(evaluate(p(), r({ amountCents: 10000 }), 0))).toBe('require_approval'));
  it('over_monthly_budget', () => expect(code(evaluate(p(), r({ amountCents: 6000 }), 45000))).toBe('over_monthly_budget'));
  it('merchant_blocked', () => expect(code(evaluate(p({ merchantDeny: ['notion'] }), r(), 0))).toBe('merchant_blocked'));
  it('merchant_not_allowed', () => expect(code(evaluate(p({ merchantAllow: ['Figma'] }), r(), 0))).toBe('merchant_not_allowed'));
  it('mcc_blocked', () => expect(code(evaluate(p({ mccDeny: ['7995'] }), r({ mcc: '7995' }), 0))).toBe('mcc_blocked'));
  it('mcc_not_allowed', () => expect(code(evaluate(p({ mccAllow: ['5734'] }), r({ mcc: '5812' }), 0))).toBe('mcc_not_allowed'));
  it('mcc rules ignored when request has no mcc', () => expect(code(evaluate(p({ mccAllow: ['5734'] }), r(), 0))).toBe('require_approval'));
  it('first refusal wins: currency before limit', () =>
    expect(code(evaluate(p(), r({ currency: 'USD', amountCents: 999999 }), 0))).toBe('currency_not_allowed'));
  it('auto approves under threshold for an allow-listed merchant', () =>
    expect(code(evaluate(p({ merchantAllow: ['Notion'], autoApproveBelowCents: 5000 }), r(), 0))).toBe('auto_approve'));
  it('no auto approval without an allow-list', () =>
    expect(code(evaluate(p({ autoApproveBelowCents: 5000 }), r(), 0))).toBe('require_approval'));
  it('no auto approval at or above the threshold', () =>
    expect(code(evaluate(p({ merchantAllow: ['Notion'], autoApproveBelowCents: 4900 }), r(), 0))).toBe('require_approval'));
  it('matches merchant variants after normalisation', () =>
    expect(code(evaluate(p({ merchantAllow: ['Notion'] }), r({ merchant: 'Notion Labs Inc.' }), 0))).toBe('require_approval'));
  it('rejections carry a French message', () => {
    const d = evaluate(p(), r({ amountCents: 6000 }), 45000);
    expect(d.kind === 'reject' && d.message).toMatch(/budget/i);
  });
});

describe('garde-fous', () => {
  it('blocks risky merchant categories by default (gambling, money transfer, quasi-cash, securities)', () => {
    for (const mcc of ['7995', '4829', '6051', '6211']) expect(code(evaluate(p(), r({ mcc }), 0))).toBe('mcc_blocked');
  });
  it('lets an explicitly allowed risky category through', () => {
    expect(code(evaluate(p({ mccAllow: ['4829'] }), r({ mcc: '4829' }), 0))).toBe('require_approval');
  });
  it('refuses beyond the hourly velocity limit', () => {
    expect(code(evaluate(p({ maxRequestsPerHour: 5 }), r(), 0, { requestsLastHour: 5 }))).toBe('too_many_requests');
    expect(code(evaluate(p({ maxRequestsPerHour: 5 }), r(), 0, { requestsLastHour: 4 }))).toBe('require_approval');
  });
  it('forces human approval on an amount far above the usual', () => {
    const pol = p({ merchantAllow: ['Notion'], autoApproveBelowCents: 9000 });
    const history = [1000, 1200, 900, 1100, 1000];
    const d = evaluate(pol, r({ amountCents: 4900 }), 0, { recentAmounts: history });
    expect(d.kind).toBe('require_approval');
    expect(d.kind === 'require_approval' && d.flags).toContain('unusual_amount');
    expect(code(evaluate(pol, r({ amountCents: 1500 }), 0, { recentAmounts: history }))).toBe('auto_approve');
  });
});
