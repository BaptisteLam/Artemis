import { ArtemisError, currentBudgetMonth, monthBounds } from '@artemis/shared';
import type { AgentRow } from '@artemis/db';
import type { Ctx } from './context';
import { policyFromRow } from './policies';

export async function budgetsFor(ctx: Ctx, agent: AgentRow) {
  const policy = policyFromRow(await ctx.store.getPolicy(agent.id));
  const period = currentBudgetMonth(ctx.now());
  const spent = await ctx.store.sumCommitted(agent.id, monthBounds(period).start);
  return {
    period,
    currency: policy.currencies[0] ?? 'EUR',
    monthly_budget: policy.monthlyBudgetCents,
    spent,
    remaining: Math.max(0, policy.monthlyBudgetCents - spent),
    per_transaction_limit: policy.perTxLimitCents,
    auto_approve_below: policy.autoApproveBelowCents,
    allowed_merchants: policy.merchantAllow,
    amounts_in: 'cents',
  };
}

const SPENT = new Set(['issued', 'completed']);

export async function spendSummary(ctx: Ctx, agent: AgentRow, period: string) {
  const now = ctx.now();
  let from: Date;
  if (period === 'day') from = new Date(now.getTime() - 86_400_000);
  else if (period === 'week') from = new Date(now.getTime() - 7 * 86_400_000);
  else if (period === 'month') from = monthBounds(currentBudgetMonth(now)).start;
  else throw new ArtemisError('invalid_input', 'period doit valoir day, week ou month.');
  const rows = (await ctx.store.listCardRequests(agent.org_id, { agentId: agent.id, from, limit: 5000 })).filter((r) => SPENT.has(r.status));
  const map = new Map<string, { merchant: string; amount: number; count: number }>();
  for (const r of rows) {
    const key = r.merchant.toLowerCase();
    const e = map.get(key) ?? { merchant: r.merchant, amount: 0, count: 0 };
    e.amount += Number(r.amount_cents);
    e.count += 1;
    map.set(key, e);
  }
  const by_merchant = [...map.values()].sort((a, b) => b.amount - a.amount);
  return { period, from: from.toISOString(), total: by_merchant.reduce((s, m) => s + m.amount, 0), by_merchant, amounts_in: 'cents' };
}
