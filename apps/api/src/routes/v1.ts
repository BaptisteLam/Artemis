import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { ArtemisError, parseWith } from '@artemis/shared';
import type { AppEnv } from '../http/types';
import { agentAuth } from '../http/auth';
import { cancelCard, createCardRequest, getRequestStatus, revealCardForCheckout } from '../services/requests';
import { budgetsFor, spendSummary } from '../services/spend';
import { addReceipt, decodeBase64, fetchReceiptUrl } from '../services/receipts';

export const v1 = new Hono<AppEnv>();

const Waitlist = z.object({
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(120).optional().nullable(),
  use_case: z.string().trim().max(1000).optional().nullable(),
});

v1.use('/waitlist', async (c, next) => cors({ origin: c.env.SITE_ORIGIN, allowMethods: ['POST', 'OPTIONS'], allowHeaders: ['Content-Type'] })(c, next));
v1.post('/waitlist', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const minute = Math.floor(c.var.ctx.now().getTime() / 60_000);
  if (!(await c.var.ctx.store.hitRateLimit(`waitlist:${ip}:${minute}`, 60, 5))) {
    throw new ArtemisError('rate_limited', 'Trop de tentatives, réessayez dans une minute.');
  }
  const body = parseWith(Waitlist, await c.req.json().catch(() => ({})));
  await c.var.ctx.store.waitlistAdd({ email: body.email.toLowerCase(), company: body.company ?? null, use_case: body.use_case ?? null });
  return c.json({ ok: true });
});

const Receipt = z.object({
  url: z.string().url().optional(),
  content_base64: z.string().min(1).optional(),
  filename: z.string().min(1).max(200).optional(),
});

export async function receiptFromArgs(ctx: AppEnv['Variables']['ctx'], raw: unknown) {
  const args = parseWith(Receipt, raw);
  if (args.content_base64) {
    if (!args.filename) throw new ArtemisError('invalid_input', 'filename est requis avec content_base64.');
    return { filename: args.filename, bytes: decodeBase64(args.content_base64), contentType: null };
  }
  if (args.url) {
    const f = await fetchReceiptUrl(ctx, args.url);
    return { filename: args.filename ?? f.filename, bytes: f.bytes, contentType: f.contentType };
  }
  throw new ArtemisError('invalid_input', 'Fournissez url ou content_base64.');
}

const agentRoutes = new Hono<AppEnv>();
agentRoutes.use('*', agentAuth);

agentRoutes.get('/me', (c) =>
  c.json({ agent: { id: c.var.agent.id, name: c.var.agent.name }, organization: { id: c.var.org.id, name: c.var.org.name } }),
);

agentRoutes.post('/card-requests', async (c) => {
  const out = await createCardRequest(c.var.ctx, c.var.agent, await c.req.json().catch(() => ({})));
  return c.json({ request_id: out.requestId, status: out.status, reason: out.reason ?? null }, 201);
});

agentRoutes.get('/card-requests/:id', async (c) => c.json(await getRequestStatus(c.var.ctx, c.var.agent, c.req.param('id'))));

agentRoutes.post('/card-requests/:id/reveal', async (c) => {
  const card = await revealCardForCheckout(c.var.ctx, c.var.agent, c.req.param('id'));
  c.header('Cache-Control', 'no-store');
  return c.json(card);
});

agentRoutes.post('/card-requests/:id/cancel', async (c) =>
  c.json(await cancelCard(c.var.ctx, { type: 'agent', id: c.var.agent.id }, c.var.org.id, c.req.param('id'))),
);

agentRoutes.post('/card-requests/:id/receipts', async (c) => {
  const file = await receiptFromArgs(c.var.ctx, await c.req.json().catch(() => ({})));
  const r = await addReceipt(c.var.ctx, { type: 'agent', id: c.var.agent.id }, c.var.org.id, c.req.param('id'), file);
  return c.json({ receipt_id: r.id }, 201);
});

agentRoutes.get('/budgets', async (c) => c.json(await budgetsFor(c.var.ctx, c.var.agent)));
agentRoutes.get('/spend-summary', async (c) => c.json(await spendSummary(c.var.ctx, c.var.agent, c.req.query('period') ?? 'month')));

v1.route('/', agentRoutes);
