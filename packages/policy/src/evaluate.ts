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
}

export type PolicyDecision =
  | { kind: 'reject'; code: PolicyRejectCode; message: string }
  | { kind: 'auto_approve' }
  | { kind: 'require_approval' };

export interface PolicyRequest {
  amountCents: number;
  currency: string;
  merchant: string;
  mcc?: string;
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
export function evaluate(policy: Policy, req: PolicyRequest, spentThisMonthCents: number): PolicyDecision {
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
  if (req.mcc) {
    if (policy.mccDeny.includes(req.mcc)) {
      return reject('mcc_blocked', `La catégorie marchande ${req.mcc} est interdite.`);
    }
    if (policy.mccAllow.length > 0 && !policy.mccAllow.includes(req.mcc)) {
      return reject('mcc_not_allowed', `La catégorie marchande ${req.mcc} n'est pas autorisée.`);
    }
  }
  if (allowListed && req.amountCents < policy.autoApproveBelowCents) return { kind: 'auto_approve' };
  return { kind: 'require_approval' };
}
