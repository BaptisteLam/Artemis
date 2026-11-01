export type Plan = 'sandbox' | 'builder' | 'team' | 'business';

export interface PlanLimits {
  agents: number;
  bankConnections: number;
  requestsPerMonth: number;
  fec: boolean;
  auditExport: boolean;
  restApi: boolean;
  priceEur: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  sandbox: { agents: 1, bankConnections: 0, requestsPerMonth: 50, fec: false, auditExport: false, restApi: true, priceEur: 0 },
  builder: { agents: 3, bankConnections: 1, requestsPerMonth: 100, fec: false, auditExport: false, restApi: true, priceEur: 19 },
  team: { agents: 15, bankConnections: 2, requestsPerMonth: 1000, fec: true, auditExport: false, restApi: true, priceEur: 49 },
  business: { agents: Infinity, bankConnections: Infinity, requestsPerMonth: Infinity, fec: true, auditExport: true, restApi: true, priceEur: 149 },
};

export const PLANS: Plan[] = ['sandbox', 'builder', 'team', 'business'];

const TZ = 'Europe/Paris';

function parisParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

export function currentBudgetMonth(now: Date): string {
  const p = parisParts(now);
  return `${p.y}-${String(p.m).padStart(2, '0')}`;
}

/** Instant UTC correspondant à minuit (heure de Paris) le 1er du mois donné. */
function parisMidnight(y: number, m: number): Date {
  const guess = Date.UTC(y, m - 1, 1);
  const p = parisParts(new Date(guess));
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  const offset = asUtc - guess;
  return new Date(guess - offset);
}

export function monthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  return { start: parisMidnight(y, m), end: parisMidnight(next[0]!, next[1]!) };
}
