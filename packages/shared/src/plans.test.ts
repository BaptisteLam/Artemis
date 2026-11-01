import { describe, expect, it } from 'vitest';
import { OVERAGE_CENTS, PLAN_LIMITS, PLANS, currentBudgetMonth, monthBounds } from './plans';

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
  it('plan limits (grille V2)', () => {
    expect(PLANS).toEqual(['sandbox', 'builder', 'team', 'agency', 'business']);
    expect([PLAN_LIMITS.sandbox.priceEur, PLAN_LIMITS.builder.priceEur, PLAN_LIMITS.team.priceEur, PLAN_LIMITS.agency.priceEur, PLAN_LIMITS.business.priceEur]).toEqual([0, 29, 99, 249, 690]);
    expect(PLAN_LIMITS.sandbox.requestsPerMonth).toBe(20);
    expect(PLAN_LIMITS.builder.requestsPerMonth).toBe(50);
    expect(PLAN_LIMITS.team.requestsPerMonth).toBe(300);
    expect(PLAN_LIMITS.agency.requestsPerMonth).toBe(1000);
    expect(PLAN_LIMITS.team.agents).toBe(10);
    expect(PLAN_LIMITS.agency.clients).toBe(Infinity);
    expect(PLAN_LIMITS.agency.perClientEur).toBe(15);
    expect(PLAN_LIMITS.sandbox.overage).toBe(false);
    expect(PLAN_LIMITS.builder.overage).toBe(true);
    expect(PLAN_LIMITS.business.auditExport).toBe(true);
    expect(PLAN_LIMITS.team.quorum).toBe(true);
    expect(PLAN_LIMITS.builder.slack).toBe(false);
    expect(OVERAGE_CENTS).toBe(25);
  });
});
