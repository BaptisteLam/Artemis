export type Plan = 'sandbox' | 'builder' | 'team' | 'agency' | 'business';

export interface PlanLimits {
  agents: number;
  bankConnections: number;
  requestsPerMonth: number;
  /** Au-delà du quota : facturer le dépassement (true) ou refuser (false). */
  overage: boolean;
  clients: number;
  perClientEur: number;
  fec: boolean;
  auditExport: boolean;
  slack: boolean;
  quorum: boolean;
  subscriptions: boolean;
  restApi: boolean;
  priceEur: number;
}

/** Prix d'un mandat au-delà du quota mensuel (plans payants). */
export const OVERAGE_CENTS = 25;

const BASE = { restApi: true, perClientEur: 0 };

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  sandbox: { ...BASE, agents: 1, bankConnections: 0, requestsPerMonth: 20, overage: false, clients: 0, fec: false, auditExport: false, slack: false, quorum: false, subscriptions: false, priceEur: 0 },
  builder: { ...BASE, agents: 3, bankConnections: 1, requestsPerMonth: 50, overage: true, clients: 0, fec: false, auditExport: false, slack: false, quorum: false, subscriptions: false, priceEur: 29 },
  team: { ...BASE, agents: 10, bankConnections: 2, requestsPerMonth: 300, overage: true, clients: 0, fec: true, auditExport: false, slack: true, quorum: true, subscriptions: true, priceEur: 99 },
  agency: { ...BASE, agents: 25, bankConnections: 3, requestsPerMonth: 1000, overage: true, clients: Infinity, perClientEur: 15, fec: true, auditExport: false, slack: true, quorum: true, subscriptions: true, priceEur: 249 },
  business: { ...BASE, agents: Infinity, bankConnections: Infinity, requestsPerMonth: Infinity, overage: true, clients: Infinity, fec: true, auditExport: true, slack: true, quorum: true, subscriptions: true, priceEur: 690 },
};

export const PLANS: Plan[] = ['sandbox', 'builder', 'team', 'agency', 'business'];

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
