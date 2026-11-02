import type { Ctx } from './context';

export const DORMANT_DAYS = 45;

/** Abonnements gérés par les agents : carte active, paiements, total, dormance. */
export async function listSubscriptions(ctx: Ctx, orgId: string) {
  const [requests, agents, txs] = await Promise.all([
    ctx.store.listCardRequests(orgId, { limit: 2000 }),
    ctx.store.listAgents(orgId),
    ctx.store.listTransactions(orgId, { limit: 10000 }),
  ]);
  const now = ctx.now().getTime();
  const out = [];
  for (const r of requests.filter((x) => x.recurring_interval === 'month' && x.status === 'issued')) {
    const card = await ctx.store.getCardByRequest(r.id);
    if (!card) continue;
    const paid = txs.filter((t) => t.card_id === card.id && t.status === 'posted');
    const last = paid.map((t) => new Date(t.occurred_at).getTime()).sort((a, b) => b - a)[0];
    const since = last ?? new Date(card.created_at).getTime();
    out.push({
      request_id: r.id,
      card_id: card.id,
      last4: card.last4,
      card_status: card.status,
      merchant: r.merchant,
      purpose: r.purpose,
      monthly_limit_cents: Number(r.amount_cents),
      currency: r.currency,
      agent: agents.find((a) => a.id === r.agent_id)?.name ?? null,
      payments: paid.length,
      total_paid_cents: paid.reduce((s, t) => s + Number(t.amount_cents), 0),
      last_payment_at: last ? new Date(last).toISOString() : null,
      dormant: card.status === 'active' && now - since > DORMANT_DAYS * 86_400_000,
    });
  }
  return out;
}
