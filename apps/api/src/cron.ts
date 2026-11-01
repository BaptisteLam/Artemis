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

/** Tâche planifiée (toutes les 5 minutes). Elle maintient aussi la base Supabase active. */
export async function runScheduled(ctx: Ctx) {
  await step('expire-requests', () => expireRequests(ctx));
  await step('expire-cards', () => expireCards(ctx));
  await step('sync', () => syncAll(ctx));
}

export async function runScheduledFromEnv(env: Env): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const ctx = buildCtx(env, {}, (p) => void pending.push(p.catch(() => undefined)));
  await runScheduled(ctx);
  await Promise.all(pending);
}
