import { Hono } from 'hono';
import { z } from 'zod';
import { ArtemisError, currentBudgetMonth, monthBounds, parseWith, randomToken, sha256Hex } from '@artemis/shared';
import { encryptCredentials, newSandboxState } from '@artemis/connectors';
import type { AppEnv } from '../../http/types';
import { ANY_ROLE, MANAGERS, requireRole } from '../../http/auth';
import { audit } from '../../services/audit';
import { effectivePlan, limitsFor } from '../../services/plan';
import { freezeOrganization, unfreezeOrganization } from '../../services/requests';

export const orgRoutes = new Hono<AppEnv>();

const Name = z.object({ name: z.string().trim().min(1).max(120) });
const Role = z.enum(['owner', 'admin', 'approver', 'viewer']);

orgRoutes.post('/orgs', async (c) => {
  const { name } = parseWith(Name, await c.req.json().catch(() => ({})));
  const { store, env } = c.var.ctx;
  const user = c.var.user;
  const org = await store.createOrganization({ name });
  await store.addMembership({ org_id: org.id, user_id: user.id, email: user.email, role: 'owner' });
  await store.createBankConnection({
    org_id: org.id,
    provider: 'sandbox',
    label: 'Banque simulée',
    credentials_ciphertext: await encryptCredentials(newSandboxState(), env.CONNECTIONS_KEY),
  });
  await audit(c.var.ctx, org.id, { type: 'user', id: user.id }, 'org.created', org.id, { name });
  return c.json({ organization: org }, 201);
});

orgRoutes.get('/org', requireRole(...ANY_ROLE), async (c) => {
  const org = c.var.org;
  const period = currentBudgetMonth(c.var.ctx.now());
  return c.json({
    organization: org,
    role: c.var.membership.role,
    effective_plan: effectivePlan(org),
    limits: limitsFor(org),
    usage: { period, requests: await c.var.ctx.store.getUsage(org.id, period) },
  });
});

orgRoutes.patch('/org', requireRole(...MANAGERS), async (c) => {
  const body = parseWith(
    z.object({ name: z.string().trim().min(1).max(120).optional(), card_delivery: z.enum(['issuer_link', 'direct']).optional() }),
    await c.req.json().catch(() => ({})),
  );
  if (body.card_delivery && c.var.membership.role !== 'owner') throw new ArtemisError('forbidden', 'Seul un propriétaire peut changer le mode de remise des cartes.');
  const org = await c.var.ctx.store.updateOrganization(c.var.org.id, body);
  if (body.card_delivery) {
    await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'org.card_delivery_changed', c.var.org.id, { card_delivery: body.card_delivery });
  }
  return c.json({ organization: org });
});

orgRoutes.get('/dashboard', requireRole(...ANY_ROLE), async (c) => {
  const { store, now } = c.var.ctx;
  const org = c.var.org;
  const period = currentBudgetMonth(now());
  const { start } = monthBounds(period);
  const [agents, requests, transactions] = await Promise.all([
    store.listAgents(org.id),
    store.listCardRequests(org.id, { from: start, limit: 2000 }),
    store.listTransactions(org.id, { limit: 10 }),
  ]);
  const spentStatuses = new Set(['issued', 'completed']);
  const byAgent = agents.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    spent: requests.filter((r) => r.agent_id === a.id && spentStatuses.has(r.status)).reduce((s, r) => s + Number(r.amount_cents), 0),
  }));
  return c.json({
    period,
    plan: effectivePlan(org),
    frozen: !!org.frozen_at,
    spent_this_month: byAgent.reduce((s, a) => s + a.spent, 0),
    pending_count: requests.filter((r) => r.status === 'pending').length,
    requests_this_month: requests.length,
    by_agent: byAgent,
    recent_requests: requests.slice(0, 8).map((r) => ({ ...r, agent_name: agents.find((a) => a.id === r.agent_id)?.name ?? null })),
    recent_transactions: transactions,
  });
});

// Membres
orgRoutes.get('/members', requireRole(...ANY_ROLE), async (c) => c.json({ members: await c.var.ctx.store.listMembers(c.var.org.id) }));

async function ownersCount(c: { var: AppEnv['Variables'] }) {
  return (await c.var.ctx.store.listMembers(c.var.org.id)).filter((m) => m.role === 'owner').length;
}

orgRoutes.patch('/members/:userId', requireRole('owner'), async (c) => {
  const { role } = parseWith(z.object({ role: Role }), await c.req.json().catch(() => ({})));
  const target = await c.var.ctx.store.getMembership(c.var.org.id, c.req.param('userId'));
  if (!target) throw new ArtemisError('not_found', 'Membre introuvable.');
  if (target.role === 'owner' && role !== 'owner' && (await ownersCount(c)) <= 1) {
    throw new ArtemisError('invalid_input', "L'organisation doit garder au moins un propriétaire.");
  }
  await c.var.ctx.store.updateMembershipRole(c.var.org.id, target.user_id, role);
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'member.role_changed', target.user_id, { role });
  return c.json({ ok: true });
});

orgRoutes.delete('/members/:userId', requireRole(...MANAGERS), async (c) => {
  const target = await c.var.ctx.store.getMembership(c.var.org.id, c.req.param('userId'));
  if (!target) throw new ArtemisError('not_found', 'Membre introuvable.');
  if (target.role === 'owner' && (await ownersCount(c)) <= 1) {
    throw new ArtemisError('invalid_input', "L'organisation doit garder au moins un propriétaire.");
  }
  if (target.role === 'owner' && c.var.membership.role !== 'owner') throw new ArtemisError('forbidden', 'Seul un propriétaire peut retirer un propriétaire.');
  await c.var.ctx.store.removeMembership(c.var.org.id, target.user_id);
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'member.removed', target.user_id, {});
  return c.json({ ok: true });
});

// Invitations
orgRoutes.get('/invitations', requireRole(...MANAGERS), async (c) => {
  const list = await c.var.ctx.store.listInvitations(c.var.org.id);
  return c.json({ invitations: list.map(({ token_hash: _t, ...i }) => i) });
});

orgRoutes.post('/invitations', requireRole(...MANAGERS), async (c) => {
  const body = parseWith(z.object({ email: z.string().trim().toLowerCase().email(), role: Role.default('approver') }), await c.req.json().catch(() => ({})));
  if (body.role === 'owner' && c.var.membership.role !== 'owner') throw new ArtemisError('forbidden', 'Seul un propriétaire peut inviter un propriétaire.');
  const token = randomToken(24);
  const inv = await c.var.ctx.store.createInvitation({
    org_id: c.var.org.id,
    email: body.email,
    role: body.role,
    token_hash: await sha256Hex(token),
    invited_by: c.var.user.id,
    expires_at: new Date(c.var.ctx.now().getTime() + 7 * 86_400_000).toISOString(),
  });
  const link = `${c.env.APP_ORIGIN}/invitation?token=${token}`;
  c.var.ctx.defer(c.var.ctx.notify.invitation(body.email, c.var.org.name, link));
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'member.invited', body.email, { role: body.role });
  const { token_hash: _t, ...publicInv } = inv;
  return c.json({ invitation: publicInv, link }, 201);
});

orgRoutes.delete('/invitations/:id', requireRole(...MANAGERS), async (c) => {
  await c.var.ctx.store.deleteInvitation(c.var.org.id, c.req.param('id'));
  return c.json({ ok: true });
});

orgRoutes.post('/invitations/accept', async (c) => {
  const { token } = parseWith(z.object({ token: z.string().min(10) }), await c.req.json().catch(() => ({})));
  const { store, now } = c.var.ctx;
  const inv = await store.getInvitationByTokenHash(await sha256Hex(token));
  const user = c.var.user;
  if (!inv || inv.accepted_at || new Date(inv.expires_at) < now()) throw new ArtemisError('invalid_input', 'Invitation invalide ou expirée.');
  if (inv.email !== user.email) throw new ArtemisError('invalid_input', `Cette invitation est destinée à ${inv.email}.`);
  await store.addMembership({ org_id: inv.org_id, user_id: user.id, email: user.email, role: inv.role });
  await store.markInvitationAccepted(inv.id);
  await audit(c.var.ctx, inv.org_id, { type: 'user', id: user.id }, 'member.joined', user.id, { role: inv.role });
  return c.json({ organization: await store.getOrganization(inv.org_id), role: inv.role });
});

// Gel d'urgence
orgRoutes.post('/freeze', requireRole(...MANAGERS), async (c) => c.json(await freezeOrganization(c.var.ctx, c.var.user, c.var.org.id)));
orgRoutes.post('/unfreeze', requireRole(...MANAGERS), async (c) => {
  await unfreezeOrganization(c.var.ctx, c.var.user, c.var.org.id);
  return c.json({ ok: true });
});
