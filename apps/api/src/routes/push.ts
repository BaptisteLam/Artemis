import { Hono } from 'hono';
import { z } from 'zod';
import { parseWith } from '@artemis/shared';
import type { AppEnv } from '../http/types';
import { userAuth } from '../http/auth';

const Sub = z.object({ endpoint: z.string().url().startsWith('https://'), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) });

export const pushRoutes = new Hono<AppEnv>();
pushRoutes.use('*', userAuth);
pushRoutes.get('/public-key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY ?? null }));
pushRoutes.post('/subscribe', async (c) => {
  const s = parseWith(Sub, await c.req.json().catch(() => ({})));
  await c.var.ctx.store.savePushSubscription({ user_id: c.var.user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth });
  return c.json({ ok: true });
});
pushRoutes.delete('/subscribe', async (c) => {
  const { endpoint } = parseWith(z.object({ endpoint: z.string().url() }), await c.req.json().catch(() => ({})));
  await c.var.ctx.store.deletePushSubscription(endpoint);
  return c.json({ ok: true });
});
