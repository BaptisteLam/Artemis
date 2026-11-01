import { Hono } from 'hono';
import { z } from 'zod';
import { ArtemisError, parseWith } from '@artemis/shared';
import { createConnector, encryptCredentials, newSandboxState, QontoConnector, SandboxConnector } from '@artemis/connectors';
import type { AppEnv } from '../../http/types';
import { ANY_ROLE, APPROVERS, MANAGERS, requireRole } from '../../http/auth';
import { audit } from '../../services/audit';
import { connectorFor } from '../../services/banks';
import { limitsFor } from '../../services/plan';
import { applyBankTransaction } from '../../services/reconcile';
import { publicConnection } from './shared';

export const bankingRoutes = new Hono<AppEnv>();

const ConnectionInput = z.object({
  provider: z.enum(['sandbox', 'stripe', 'qonto', 'revolut']),
  label: z.string().trim().min(1).max(80).optional(),
  credentials: z.record(z.unknown()).optional(),
});

const LABELS = { sandbox: 'Banque simulée', stripe: 'Stripe Issuing', qonto: 'Qonto', revolut: 'Revolut Business' } as const;

bankingRoutes.get('/connections', requireRole(...ANY_ROLE), async (c) => {
  const list = await c.var.ctx.store.listBankConnections(c.var.org.id);
  return c.json({ connections: list.map(publicConnection) });
});

bankingRoutes.post('/connections', requireRole(...MANAGERS), async (c) => {
  const input = parseWith(ConnectionInput, await c.req.json().catch(() => ({})));
  const { store, env } = c.var.ctx;
  const existing = await store.listBankConnections(c.var.org.id);
  if (input.provider !== 'sandbox') {
    const limits = limitsFor(c.var.org);
    const real = existing.filter((x) => x.provider !== 'sandbox').length;
    if (real >= limits.bankConnections) {
      throw new ArtemisError('plan_limit', limits.bankConnections === 0 ? 'Choisissez un plan payant pour connecter une vraie banque.' : `Votre plan permet ${limits.bankConnections} banque(s).`);
    }
  } else if (existing.some((x) => x.provider === 'sandbox')) {
    throw new ArtemisError('invalid_input', 'Une banque simulée existe déjà.');
  }
  const credentials = input.provider === 'sandbox' ? newSandboxState() : (input.credentials ?? {});
  let latest: unknown = credentials;
  const connector = createConnector(input.provider, credentials, {
    fetch: c.var.ctx.fetch,
    now: c.var.ctx.now,
    onCredentialsUpdate: async (next) => void (latest = next),
  });
  let test: { ok: boolean; detail?: string };
  try {
    test = await connector.testConnection();
  } catch (e) {
    test = { ok: false, detail: e instanceof Error ? e.message : 'erreur' };
  }
  if (!test.ok) throw new ArtemisError('bank_error', `Connexion refusée par la banque${test.detail ? ` : ${test.detail}` : ''}.`);
  const conn = await store.createBankConnection({
    org_id: c.var.org.id,
    provider: input.provider,
    label: input.label ?? LABELS[input.provider],
    credentials_ciphertext: await encryptCredentials(latest, env.CONNECTIONS_KEY),
  });
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'bank.connected', conn.id, { provider: conn.provider });
  return c.json({ connection: publicConnection(conn), test }, 201);
});

bankingRoutes.post('/connections/:id/test', requireRole(...MANAGERS), async (c) => {
  const conn = await c.var.ctx.store.getBankConnection(c.req.param('id'));
  if (!conn || conn.org_id !== c.var.org.id) throw new ArtemisError('not_found', 'Banque introuvable.');
  try {
    return c.json(await (await connectorFor(c.var.ctx, conn)).testConnection());
  } catch (e) {
    return c.json({ ok: false, detail: e instanceof Error ? e.message : 'erreur' });
  }
});

bankingRoutes.delete('/connections/:id', requireRole(...MANAGERS), async (c) => {
  const conn = await c.var.ctx.store.getBankConnection(c.req.param('id'));
  if (!conn || conn.org_id !== c.var.org.id) throw new ArtemisError('not_found', 'Banque introuvable.');
  await c.var.ctx.store.deleteBankConnection(conn.id);
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'bank.disconnected', conn.id, { provider: conn.provider });
  return c.json({ ok: true });
});

/** Sandbox : simule le paiement de l'agent chez le marchand, puis rapproche immédiatement. */
bankingRoutes.post('/sandbox/simulate-payment', requireRole(...APPROVERS), async (c) => {
  const body = parseWith(
    z.object({ request_id: z.string().uuid(), amount: z.number().int().positive().optional(), merchant: z.string().trim().min(1).max(120).optional() }),
    await c.req.json().catch(() => ({})),
  );
  const { store } = c.var.ctx;
  const request = await store.getCardRequest(body.request_id);
  if (!request || request.org_id !== c.var.org.id) throw new ArtemisError('not_found', 'Demande introuvable.');
  const card = await store.getCardByRequest(request.id);
  if (!card || !card.bank_connection_id) throw new ArtemisError('card_not_ready', "Aucune carte n'a été émise pour cette demande.");
  const conn = await store.getBankConnection(card.bank_connection_id);
  if (!conn || conn.provider !== 'sandbox') throw new ArtemisError('invalid_input', 'La simulation ne fonctionne qu’avec la banque simulée.');
  const connector = await connectorFor(c.var.ctx, conn);
  if (!(connector instanceof SandboxConnector)) throw new ArtemisError('invalid_input', 'Banque simulée attendue.');
  const tx = await connector.simulatePayment(card.provider_card_id, {
    amountCents: body.amount ?? Number(request.amount_cents),
    merchantName: body.merchant ?? request.merchant,
  });
  const row = await applyBankTransaction(c.var.ctx, conn, tx);
  return c.json({ transaction: row });
});

/** Qonto : URL de l'affichage sécurisé de la carte, pour l'approbateur uniquement. */
bankingRoutes.get('/cards/:id/secure-view', requireRole(...APPROVERS), async (c) => {
  const card = await c.var.ctx.store.getCard(c.req.param('id'));
  if (!card || card.org_id !== c.var.org.id || !card.bank_connection_id) throw new ArtemisError('not_found', 'Carte introuvable.');
  const conn = await c.var.ctx.store.getBankConnection(card.bank_connection_id);
  if (!conn) throw new ArtemisError('not_found', 'Banque introuvable.');
  const connector = await connectorFor(c.var.ctx, conn);
  if (!(connector instanceof QontoConnector)) throw new ArtemisError('invalid_input', "L'affichage sécurisé n'existe que pour Qonto.");
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'card.viewed', card.request_id, { card_id: card.id });
  return c.json({ url: await connector.secureViewUrl(card.provider_card_id) });
});
