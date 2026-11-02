import { Hono } from 'hono';
import { z } from 'zod';
import { ArtemisError, currentBudgetMonth, monthBounds, parseWith } from '@artemis/shared';
import type { AppEnv } from '../../http/types';
import { ANY_ROLE, MANAGERS, requireRole } from '../../http/auth';
import { audit } from '../../services/audit';
import { limitsFor } from '../../services/plan';
import { clientReport, clientReportCsv } from '../../services/clients';

export const clientRoutes = new Hono<AppEnv>();

const ClientInput = z.object({
  name: z.string().trim().min(1).max(120),
  billing_email: z.string().trim().toLowerCase().email().nullable().optional(),
  markup_pct: z.number().min(0).max(200).default(0),
  monthly_budget_cents: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

async function loadClient(c: { var: AppEnv['Variables'] }, id: string) {
  const client = await c.var.ctx.store.getClient(id);
  if (!client || client.org_id !== c.var.org.id) throw new ArtemisError('not_found', 'Client introuvable.');
  return client;
}

clientRoutes.get('/clients', requireRole(...ANY_ROLE), async (c) => {
  const { store, now } = c.var.ctx;
  const start = monthBounds(currentBudgetMonth(now())).start;
  const clients = await store.listClients(c.var.org.id);
  const agents = await store.listAgents(c.var.org.id);
  return c.json({
    clients: await Promise.all(
      clients.map(async (cl) => ({ ...cl, spent_this_month: await store.sumCommittedForClient(cl.id, start), agents: agents.filter((a) => a.client_id === cl.id).length })),
    ),
  });
});

clientRoutes.post('/clients', requireRole(...MANAGERS), async (c) => {
  const limits = limitsFor(c.var.org);
  if (limits.clients <= 0) throw new ArtemisError('plan_limit', 'Les espaces clients sont inclus dans les plans Agences et Business.');
  const input = parseWith(ClientInput, await c.req.json().catch(() => ({})));
  const client = await c.var.ctx.store.createClient({
    org_id: c.var.org.id,
    name: input.name,
    billing_email: input.billing_email ?? null,
    markup_pct: input.markup_pct,
    monthly_budget_cents: input.monthly_budget_cents ?? null,
  });
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'client.created', client.id, { name: client.name });
  return c.json({ client }, 201);
});

clientRoutes.patch('/clients/:id', requireRole(...MANAGERS), async (c) => {
  const client = await loadClient(c, c.req.param('id'));
  const patch = parseWith(ClientInput.partial().extend({ status: z.enum(['active', 'archived']).optional() }), await c.req.json().catch(() => ({})));
  const updated = await c.var.ctx.store.updateClient(client.id, patch);
  await audit(c.var.ctx, c.var.org.id, { type: 'user', id: c.var.user.id }, 'client.updated', client.id, patch);
  return c.json({ client: updated });
});

clientRoutes.get('/clients/:id/report', requireRole(...ANY_ROLE), async (c) => {
  const client = await loadClient(c, c.req.param('id'));
  const month = c.req.query('month') ?? currentBudgetMonth(c.var.ctx.now());
  if (!/^\d{4}-\d{2}$/.test(month)) throw new ArtemisError('invalid_input', 'month doit être au format AAAA-MM.');
  const report = await clientReport(c.var.ctx, client, month);
  if (c.req.query('format') === 'csv') {
    return new Response(clientReportCsv(report), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="refacturation-${client.name.replace(/[^\w-]+/g, '_')}-${month}.csv"` },
    });
  }
  return c.json(report);
});
