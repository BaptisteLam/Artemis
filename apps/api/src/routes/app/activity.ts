import { Hono } from 'hono';
import { ArtemisError } from '@artemis/shared';
import type { RequestStatus } from '@artemis/db';
import type { AppEnv } from '../../http/types';
import { ANY_ROLE, APPROVERS, requireRole } from '../../http/auth';
import { cancelCard, rejectRequest } from '../../services/requests';
import { addReceipt, MAX_RECEIPT_BYTES } from '../../services/receipts';
import { parseDay } from './shared';

export const activityRoutes = new Hono<AppEnv>();

const STATUSES = new Set(['pending', 'approved', 'rejected', 'expired', 'issued', 'failed', 'canceled', 'completed']);

activityRoutes.get('/requests', requireRole(...ANY_ROLE), async (c) => {
  const status = c.req.query('status');
  const agentId = c.req.query('agent_id');
  const list = await c.var.ctx.store.listCardRequests(c.var.org.id, {
    status: status && STATUSES.has(status) ? (status as RequestStatus) : undefined,
    agentId: agentId || undefined,
    limit: Math.min(Number(c.req.query('limit') ?? 200) || 200, 500),
  });
  const agents = new Map((await c.var.ctx.store.listAgents(c.var.org.id)).map((a) => [a.id, a.name]));
  return c.json({ requests: list.map((r) => ({ ...r, agent_name: agents.get(r.agent_id) ?? null })) });
});

activityRoutes.get('/requests/:id', requireRole(...ANY_ROLE), async (c) => {
  const { store } = c.var.ctx;
  const request = await store.getCardRequest(c.req.param('id'));
  if (!request || request.org_id !== c.var.org.id) throw new ArtemisError('not_found', 'Demande introuvable.');
  const [agent, mandate, card, receipts, policy, approvals] = await Promise.all([
    store.getAgent(request.agent_id),
    store.getMandate(request.id),
    store.getCardByRequest(request.id),
    store.listReceipts(c.var.org.id, request.id),
    store.getPolicy(request.agent_id),
    store.listApprovals(request.id),
  ]);
  const bankConn = card?.bank_connection_id ? await store.getBankConnection(card.bank_connection_id) : null;
  const transactions = card ? (await store.listTransactions(c.var.org.id, { limit: 2000 })).filter((t) => t.card_id === card.id) : [];
  return c.json({
    request,
    agent: agent ? { id: agent.id, name: agent.name, platform: agent.platform } : null,
    policy,
    mandate,
    approvals: approvals.map((a) => ({ user_id: a.user_id, created_at: a.created_at })),
    card,
    bank_provider: bankConn?.provider ?? null,
    receipts,
    transactions,
  });
});

activityRoutes.post('/requests/:id/reject', requireRole(...APPROVERS), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const r = await rejectRequest(c.var.ctx, c.var.user, c.var.org.id, c.req.param('id'), String(body.reason ?? ''));
  return c.json({ request: r });
});

activityRoutes.post('/requests/:id/cancel', requireRole(...APPROVERS), async (c) =>
  c.json(await cancelCard(c.var.ctx, { type: 'user', id: c.var.user.id }, c.var.org.id, c.req.param('id'))),
);

activityRoutes.get('/cards', requireRole(...ANY_ROLE), async (c) => c.json({ cards: await c.var.ctx.store.listCards(c.var.org.id) }));

activityRoutes.get('/transactions', requireRole(...ANY_ROLE), async (c) => {
  const now = c.var.ctx.now();
  const from = parseDay(c.req.query('from'), new Date(now.getTime() - 90 * 86_400_000));
  const to = parseDay(c.req.query('to'), new Date(now.getTime() + 86_400_000));
  return c.json({ transactions: await c.var.ctx.store.listTransactions(c.var.org.id, { from, to }) });
});

activityRoutes.post('/requests/:id/receipts', requireRole(...APPROVERS), async (c) => {
  const len = Number(c.req.header('content-length') ?? 0);
  if (len > MAX_RECEIPT_BYTES + 100_000) throw new ArtemisError('invalid_input', 'Justificatif supérieur à 10 Mo.');
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file') as unknown as File | string | null | undefined;
  if (!file || typeof file === 'string') throw new ArtemisError('invalid_input', 'Fichier manquant (champ « file »).');
  const r = await addReceipt(c.var.ctx, { type: 'user', id: c.var.user.id }, c.var.org.id, c.req.param('id'), {
    filename: file.name,
    bytes: await file.arrayBuffer(),
    contentType: file.type || null,
  });
  return c.json({ receipt: r }, 201);
});

activityRoutes.get('/receipts/:id', requireRole(...ANY_ROLE), async (c) => {
  const r = await c.var.ctx.store.getReceipt(c.req.param('id'));
  if (!r || r.org_id !== c.var.org.id) throw new ArtemisError('not_found', 'Justificatif introuvable.');
  const f = await c.var.ctx.store.getFile(r.storage_path);
  if (!f) throw new ArtemisError('not_found', 'Fichier introuvable.');
  return new Response(f.body, {
    headers: {
      'Content-Type': r.content_type,
      'Content-Disposition': `inline; filename="${r.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
