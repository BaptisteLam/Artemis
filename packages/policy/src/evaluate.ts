import { formatAmount, merchantMatches, type PolicyRejectCode } from '@artemis/shared';

export interface Policy {
  monthlyBudgetCents: number;
  perTxLimitCents: number;
  currencies: string[];
  merchantAllow: string[];
  merchantDeny: string[];
  mccAllow: string[];
  mccDeny: string[];
  autoApproveBelowCents: number;
  cardTtlMinutes: number;
  requestTtlMinutes: number;
  /** Nombre maximal de demandes par heure (null = illimité). */
  maxRequestsPerHour?: number | null;
}

export type PolicyDecision =
  | { kind: 'reject'; code: PolicyRejectCode; message: string }
  | { kind: 'auto_approve' }
  | { kind: 'require_approval'; flags?: string[] };

export interface PolicyRequest {
  amountCents: number;
  currency: string;
  merchant: string;
  mcc?: string;
}

/** Catégories marchandes bloquées par défaut : jeux d'argent, transferts d'argent, quasi-espèces, titres. */
export const DEFAULT_BLOCKED_MCC = ['7995', '4829', '6051', '6211'];

/** Contexte récent de l'agent, pour les garde-fous anti-injection. */
export interface PolicyContext {
  requestsLastHour?: number;
  /** Montants des dernières demandes acceptées (centimes). */
  recentAmounts?: number[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export const DEFAULT_POLICY: Policy = {
  monthlyBudgetCents: 50000,
  perTxLimitCents: 10000,
  currencies: ['EUR'],
  merchantAllow: [],
  merchantDeny: [],
  mccAllow: [],
  mccDeny: [],
  autoApproveBelowCents: 0,
  cardTtlMinutes: 30,
  requestTtlMinutes: 30,
};

const reject = (code: PolicyRejectCode, message: string): PolicyDecision => ({ kind: 'reject', code, message });

/**
 * Évalue une demande contre la politique de l'agent. La première règle non respectée refuse.
 * `spentThisMonthCents` couvre les demandes en attente, validées, émises et payées du mois (heure de Paris).
 */
export function evaluate(policy: Policy, req: PolicyRequest, spentThisMonthCents: number, context: PolicyContext = {}): PolicyDecision {
  const currency = req.currency.toUpperCase();
  if (!policy.currencies.map((c) => c.toUpperCase()).includes(currency)) {
    return reject('currency_not_allowed', `La devise ${currency} n'est pas autorisée pour cet agent.`);
  }
  if (!Number.isInteger(req.amountCents) || req.amountCents <= 0) {
    return reject('invalid_amount', 'Le montant doit être un entier positif en centimes.');
  }
  if (req.amountCents > policy.perTxLimitCents) {
    return reject(
      'over_transaction_limit',
      `Montant supérieur au plafond par achat (${formatAmount(policy.perTxLimitCents, currency)}).`,
    );
  }
  if (spentThisMonthCents + req.amountCents > policy.monthlyBudgetCents) {
    const left = Math.max(0, policy.monthlyBudgetCents - spentThisMonthCents);
    return reject('over_monthly_budget', `Budget mensuel dépassé : il reste ${formatAmount(left, currency)}.`);
  }
  if (policy.merchantDeny.some((m) => merchantMatches(req.merchant, m))) {
    return reject('merchant_blocked', `Le marchand « ${req.merchant} » est interdit pour cet agent.`);
  }
  const allowListed = policy.merchantAllow.some((m) => merchantMatches(req.merchant, m));
  if (policy.merchantAllow.length > 0 && !allowListed) {
    return reject('merchant_not_allowed', `Le marchand « ${req.merchant} » n'est pas dans la liste autorisée.`);
  }
  if (policy.maxRequestsPerHour != null && (context.requestsLastHour ?? 0) >= policy.maxRequestsPerHour) {
    return reject('too_many_requests', `Trop de demandes : ${policy.maxRequestsPerHour} par heure maximum pour cet agent.`);
  }
  if (req.mcc) {
    if (DEFAULT_BLOCKED_MCC.includes(req.mcc) && !policy.mccAllow.includes(req.mcc)) {
      return reject('mcc_blocked', `Catégorie marchande ${req.mcc} bloquée par défaut (jeux, transferts, quasi-espèces ou titres).`);
    }
    if (policy.mccDeny.includes(req.mcc)) {
      return reject('mcc_blocked', `La catégorie marchande ${req.mcc} est interdite.`);
    }
    if (policy.mccAllow.length > 0 && !policy.mccAllow.includes(req.mcc)) {
      return reject('mcc_not_allowed', `La catégorie marchande ${req.mcc} n'est pas autorisée.`);
    }
  }
  const history = context.recentAmounts ?? [];
  const unusual = history.length >= 5 && req.amountCents > 3 * median(history);
  if (unusual) return { kind: 'require_approval', flags: ['unusual_amount'] };
  if (allowListed && req.amountCents < policy.autoApproveBelowCents) return { kind: 'auto_approve' };
  return { kind: 'require_approval' };
}
