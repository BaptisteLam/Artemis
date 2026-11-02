import type { Env } from './env';
import type { Ctx } from './services/context';
import { buildCtx } from './app';
import { safeLog } from './http/errors';
import { audit } from './services/audit';
import { connectorForAgentConnection } from './services/banks';
import { syncConnection } from './services/reconcile';

async function step(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    safeLog(`cron:${name}`, e);
  }
}

export async function expireRequests(ctx: Ctx) {
  for (const r of await ctx.store.listExpiredPendingRequests(ctx.now())) {
    const updated = await ctx.store.updateCardRequest(r.id, { status: 'expired' }, 'pending');
    if (updated) await audit(ctx, r.org_id, { type: 'system', id: 'expiry' }, 'request.expired', r.id, {});
  }
}

export async function expireCards(ctx: Ctx) {
  for (const card of await ctx.store.listExpiredActiveCards(ctx.now())) {
    await step(`expire-card:${card.id}`, async () => {
      try {
        const { connector } = await connectorForAgentConnection(ctx, card.bank_connection_id);
        await connector.cancelCard(card.provider_card_id);
      } catch (e) {
        safeLog('cron:cancel-card', e);
      }
      await ctx.store.updateCard(card.id, { status: 'expired' });
      await ctx.store.updateCardRequest(card.request_id, { status: 'canceled', decision_reason: 'card_expired_unused' }, 'issued');
      await audit(ctx, card.org_id, { type: 'system', id: 'expiry' }, 'card.expired', card.request_id, { card_id: card.id });
    });
  }
}

export async function syncAll(ctx: Ctx) {
  for (const conn of await ctx.store.listAllBankConnections()) {
    await step(`sync:${conn.id}`, () => syncConnection(ctx, conn));
  }
}

/** Gel automatique des agents dont un achat payé n'a toujours pas de justificatif après le délai fixé. */
export async function freezeMissingReceipts(ctx: Ctx) {
  const now = ctx.now().getTime();
  for (const org of await ctx.store.listOrganizations({ limit: 100000 })) {
    const agents = (await ctx.store.listAgents(org.id)).filter((a) => a.status === 'active');
    if (!agents.length) continue;
    const receipts = new Set((await ctx.store.listReceipts(org.id)).map((r) => r.request_id));
    let txs: Awaited<ReturnType<typeof ctx.store.listTransactions>> | null = null;
    for (const agent of agents) {
      const hours = (await ctx.store.getPolicy(agent.id))?.require_receipt_hours;
      if (!hours) continue;
      const completed = await ctx.store.listCardRequests(org.id, { agentId: agent.id, status: 'completed', limit: 200 });
      for (const req of completed) {
        if (receipts.has(req.id)) continue;
        const card = await ctx.store.getCardByRequest(req.id);
        if (!card) continue;
        txs ??= await ctx.store.listTransactions(org.id, { limit: 5000 });
        const paidAt = txs.filter((t) => t.card_id === card.id).map((t) => new Date(t.occurred_at).getTime()).sort()[0];
        if (paidAt === undefined || now - paidAt < hours * 3_600_000) continue;
        await ctx.store.updateAgent(agent.id, { status: 'frozen' });
        await audit(ctx, org.id, { type: 'system', id: 'receipts' }, 'agent.frozen', agent.id, { reason: 'missing_receipt', request_id: req.id, hours });
        break;
      }
    }
  }
}

/** Tâche planifiée (toutes les 5 minutes). Elle maintient aussi la base Supabase active. */
export async function runScheduled(ctx: Ctx) {
  await step('expire-requests', () => expireRequests(ctx));
  // Synchroniser AVANT d'expirer : une carte payée juste avant son expiration doit être rapprochée, pas annulée.
  await step('sync', () => syncAll(ctx));
  await step('expire-cards', () => expireCards(ctx));
  await step('missing-receipts', () => freezeMissingReceipts(ctx));
}

export async function runScheduledFromEnv(env: Env): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const ctx = buildCtx(env, {}, (p) => void pending.push(p.catch(() => undefined)));
  await runScheduled(ctx);
  await Promise.all(pending);
}
