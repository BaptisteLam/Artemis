import { DEFAULT_POLICY, type Policy } from '@artemis/policy';
import type { PolicyRow } from '@artemis/db';

export function policyFromRow(row: PolicyRow | null): Policy {
  if (!row) return { ...DEFAULT_POLICY };
  return {
    monthlyBudgetCents: Number(row.monthly_budget_cents),
    perTxLimitCents: Number(row.per_tx_limit_cents),
    currencies: row.currencies,
    merchantAllow: row.merchant_allow,
    merchantDeny: row.merchant_deny,
    mccAllow: row.mcc_allow,
    mccDeny: row.mcc_deny,
    autoApproveBelowCents: Number(row.auto_approve_below_cents),
    cardTtlMinutes: row.card_ttl_minutes,
    requestTtlMinutes: row.request_ttl_minutes,
    maxRequestsPerHour: row.max_requests_per_hour ?? null,
  };
}

export function defaultPolicyRow(agentId: string): Omit<PolicyRow, 'updated_at'> {
  return {
    agent_id: agentId,
    monthly_budget_cents: DEFAULT_POLICY.monthlyBudgetCents,
    per_tx_limit_cents: DEFAULT_POLICY.perTxLimitCents,
    currencies: DEFAULT_POLICY.currencies,
    merchant_allow: [],
    merchant_deny: [],
    mcc_allow: [],
    mcc_deny: [],
    auto_approve_below_cents: DEFAULT_POLICY.autoApproveBelowCents,
    card_ttl_minutes: DEFAULT_POLICY.cardTtlMinutes,
    request_ttl_minutes: DEFAULT_POLICY.requestTtlMinutes,
    freeze_on_mismatch: false,
    max_requests_per_hour: null,
    require_receipt_hours: null,
  };
}
