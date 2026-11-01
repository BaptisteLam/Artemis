import { describe, expect, it } from 'vitest';
import { PLAN_LIMITS, currentBudgetMonth, monthBounds } from './plans';

describe('plans', () => {
  it('budget month uses Europe/Paris', () => {
    expect(currentBudgetMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11');
    expect(currentBudgetMonth(new Date('2026-07-31T21:59:00Z'))).toBe('2026-07');
  });
  it('month bounds in Paris time', () => {
    const b = monthBounds('2026-11');
    expect(b.start.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(b.end.toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });
  it('plan limits', () => {
    expect(PLAN_LIMITS.builder.priceEur).toBe(19);
    expect(PLAN_LIMITS.team.requestsPerMonth).toBe(1000);
    expect(PLAN_LIMITS.business.agents).toBe(Infinity);
    expect(PLAN_LIMITS.sandbox.bankConnections).toBe(0);
  });
});
