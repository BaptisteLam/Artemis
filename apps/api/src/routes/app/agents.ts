import { Hono } from 'hono';
import { z } from 'zod';
import { ArtemisError, generateAgentToken, parseWith } from '@artemis/shared';
import type { AgentRow } from '@artemis/db';
import type { AppEnv } from '../../http/types';
import { ANY_ROLE, MANAGERS, requireRole } from '../../http/auth';
import { audit } from '../../services/audit';
import { limitsFor } from '../../services/plan';
import { defaultPolicyRow } from '../../services/policies';
import { budgetsFor } from '../../services/spend';
import { publicAgent } from './shared';

export const agentRoutes = new Hono<AppEnv>();

const Platform = z.enum(['claude', 'chatgpt', 'n8n', 'make', 'api', 'other']);
const AgentInput = z.object({
  name: z.string().trim().min(1).max(80),
  platform: Platform.default('other'),
  bank_connection_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
});

async function resolveClient(c: { var: AppEnv['Variables'] }, id: string | null | undefined) {
  if (!id) return null;
  const client = await c.var.ctx.store.getClient(id);
  if (!client || client.org_id !== c.var.org.id) throw new ArtemisError('invalid_input', 'Client inconnu pour cette organisation.');
  return client.id;
}

async function loadAgent(c: { var: AppEnv['Variables'] }, id: string): Promise<AgentRow> {
  const a = await c.var.ctx.store.getAgent(id);
  if (!a || a.org_id !== c.var.org.id) throw new ArtemisError('not_found', 'Agent introuvable.');
  return a;
}

async function tokenMode(c: { var: AppEnv['Variables'] }, connectionId: string | null): Promise<'live' | 'test'> {
  if (!connectionId) return 'test';
  const conn = await c.var.ctx.store.getBankConnection(connectionId);
  return conn && conn.provider !== 'sandbox' ? 'live' : 'test';
}

async function resolveConnection(c: { var: AppEnv['Variables'] }, id: string | null | undefined) {
  const conns = await c.var.ctx.store.listBankConnections(c.var.org.id);
  if (id) {
    if (!conns.some((x) => x.id === id)) throw new ArtemisError('invalid_input', 'Banque inconnue pour cette organisation.');
    return id;
  }
  return conns.find((x) => x.provider !== 'sandbox')?.id ?? conns[0]?.id ?? null;
}

agentRoutes.get('/agents', requireRole(...ANY_ROLE), async (c) => {
  const agents = await c.var.ctx.store.listAgents(c.var.org.id);
  const withBudget = await Promise.all(agents.map(async (a) => ({ ...publicAgent(a), budget: await budgetsFor(c.var.ctx, a) })));
  return c.json({ agents: withBudget });
});

agentRoutes.post('/agents', requireRole(...MANAGERS), async (c) => {
  const input = parseWith(AgentInput, await c.req.json().catch(() => ({})));
  const { store } = c.var.ctx;
  const limits = limitsFor(c.var.org);
  if ((await store.listAgents(c.var.org.id)).length >= limits.agents) {
    throw new ArtemisError('plan_limit', `Votre plan permet ${limits.agents} agent(s). Passez à un plan supérieur.`);
  }
  const connectionId = await resolveConnection(c, input.bank_connection_id);
  const t = await generateAgentToken(await tokenMode(c, connectionId));
  const agent = await store.createAgent({
    org_id: c.var.org.id,
    name: input.name,
    platform: input.platform,
    token_hash: t.hash,
    token_prefix: t.prefix,
    bank_connection_id: connectionId,
    client_id: await resolveClient(c, input.client_id),
  });
  await store.upsertPolicy(defaultPolicyRow(agent.id));
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'agent.created', agent.id, { name: agent.name, platform: agent.platform });
  return c.json({ agent: publicAgent(agent), token: t.token }, 201);
});

agentRoutes.get('/agents/:id', requireRole(...ANY_ROLE), async (c) => {
  const a = await loadAgent(c, c.req.param('id'));
  return c.json({ agent: publicAgent(a), policy: await c.var.ctx.store.getPolicy(a.id), budget: await budgetsFor(c.var.ctx, a) });
});

agentRoutes.patch('/agents/:id', requireRole(...MANAGERS), async (c) => {
  const a = await loadAgent(c, c.req.param('id'));
  const patch = parseWith(
    AgentInput.partial().extend({ status: z.enum(['active', 'frozen']).optional() }),
    await c.req.json().catch(() => ({})),
  );
  if (patch.bank_connection_id !== undefined) patch.bank_connection_id = await resolveConnection(c, patch.bank_connection_id);
  if (patch.client_id !== undefined) patch.client_id = await resolveClient(c, patch.client_id);
  if (patch.status === 'active' && c.var.org.frozen_at) throw new ArtemisError('org_frozen', "Dégelez d'abord l'organisation.");
  const updated = await c.var.ctx.store.updateAgent(a.id, patch);
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'agent.updated', a.id, patch);
  return c.json({ agent: publicAgent(updated) });
});

agentRoutes.delete('/agents/:id', requireRole(...MANAGERS), async (c) => {
  const a = await loadAgent(c, c.req.param('id'));
  await c.var.ctx.store.deleteAgent(a.id);
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'agent.deleted', a.id, { name: a.name });
  return c.json({ ok: true });
});

agentRoutes.post('/agents/:id/token', requireRole(...MANAGERS), async (c) => {
  const a = await loadAgent(c, c.req.param('id'));
  const t = await generateAgentToken(await tokenMode(c, a.bank_connection_id));
  await c.var.ctx.store.updateAgent(a.id, { token_hash: t.hash, token_prefix: t.prefix });
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'agent.token_rotated', a.id, {});
  return c.json({ token: t.token });
});

const Cents = z.number().int().min(0).max(100_000_000);
const PolicyInput = z
  .object({
    monthly_budget_cents: Cents,
    per_tx_limit_cents: Cents,
    currencies: z.array(z.string().regex(/^[A-Z]{3}$/)).min(1).max(10),
    merchant_allow: z.array(z.string().trim().min(1).max(120)).max(200),
    merchant_deny: z.array(z.string().trim().min(1).max(120)).max(200),
    mcc_allow: z.array(z.string().regex(/^\d{4}$/)).max(200),
    mcc_deny: z.array(z.string().regex(/^\d{4}$/)).max(200),
    auto_approve_below_cents: Cents,
    card_ttl_minutes: z.number().int().min(5).max(10080),
    request_ttl_minutes: z.number().int().min(5).max(10080),
    freeze_on_mismatch: z.boolean(),
    max_requests_per_hour: z.number().int().min(1).max(1000).nullable(),
    require_receipt_hours: z.number().int().min(1).max(2160).nullable(),
    approvals_required: z.number().int().min(1).max(3),
    quorum_above_cents: z.number().int().min(0).max(100_000_000).nullable(),
  })
  .partial();

agentRoutes.get('/agents/:id/policy', requireRole(...ANY_ROLE), async (c) => {
  const a = await loadAgent(c, c.req.param('id'));
  return c.json({ policy: (await c.var.ctx.store.getPolicy(a.id)) ?? defaultPolicyRow(a.id) });
});

agentRoutes.put('/agents/:id/policy', requireRole(...MANAGERS), async (c) => {
  const a = await loadAgent(c, c.req.param('id'));
  const patch = parseWith(PolicyInput, await c.req.json().catch(() => ({})));
  const current = (await c.var.ctx.store.getPolicy(a.id)) ?? { ...defaultPolicyRow(a.id), updated_at: '' };
  const { updated_at: _u, ...base } = current;
  const policy = await c.var.ctx.store.upsertPolicy({ ...base, ...patch, agent_id: a.id });
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'policy.updated', a.id, patch);
  return c.json({ policy });
});
