import { Hono } from 'hono';
import { ArtemisError } from '@artemis/shared';
import type { AppEnv } from '../http/types';
import { requireRole, userAuth } from '../http/auth';
import { createCheckout, createPortal, handleBillingEvent } from '../services/billing';
import { verifyStripeSignature } from '../services/stripeSignature';

export const billingRoutes = new Hono<AppEnv>();
billingRoutes.use('*', userAuth);

billingRoutes.post('/checkout', requireRole('owner'), async (c) => {
  const { plan } = (await c.req.json().catch(() => ({}))) as { plan?: string };
  return c.json({ url: await createCheckout(c.var.ctx, c.var.org, c.var.user.email, String(plan ?? '')) });
});

billingRoutes.post('/portal', requireRole('owner'), async (c) => c.json({ url: await createPortal(c.var.ctx, c.var.org) }));

export const billingWebhook = new Hono<AppEnv>();
billingWebhook.post('/', async (c) => {
  const payload = await c.req.text();
  const ok = await verifyStripeSignature(payload, c.req.header('Stripe-Signature'), c.env.STRIPE_WEBHOOK_SECRET ?? '', Math.floor(c.var.ctx.now().getTime() / 1000));
  if (!ok) throw new ArtemisError('invalid_input', 'Signature Stripe invalide.');
  await handleBillingEvent(c.var.ctx, JSON.parse(payload));
  return c.json({ received: true });
});
