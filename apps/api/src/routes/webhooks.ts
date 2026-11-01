import { Hono } from 'hono';
import { ArtemisError } from '@artemis/shared';
import { decryptCredentials, stripeTransaction } from '@artemis/connectors';
import type { AppEnv } from '../http/types';
import { verifyStripeSignature } from '../services/stripeSignature';
import { applyBankTransaction } from '../services/reconcile';

export const webhooks = new Hono<AppEnv>();

/** Transactions Stripe Issuing en temps réel (un point de terminaison par connexion). */
webhooks.post('/stripe-issuing/:connectionId', async (c) => {
  const { store, env } = c.var.ctx;
  const conn = await store.getBankConnection(c.req.param('connectionId'));
  if (!conn || conn.provider !== 'stripe') throw new ArtemisError('not_found', 'Connexion inconnue.');
  const creds = await decryptCredentials<{ webhookSecret?: string }>(conn.credentials_ciphertext, env.CONNECTIONS_KEY);
  const payload = await c.req.text();
  if (!creds.webhookSecret || !(await verifyStripeSignature(payload, c.req.header('Stripe-Signature'), creds.webhookSecret, Math.floor(c.var.ctx.now().getTime() / 1000)))) {
    throw new ArtemisError('invalid_input', 'Signature Stripe invalide.');
  }
  const event = JSON.parse(payload) as { type: string; data: { object: Parameters<typeof stripeTransaction>[0] } };
  if (event.type === 'issuing_transaction.created' || event.type === 'issuing_transaction.updated') {
    await applyBankTransaction(c.var.ctx, conn, stripeTransaction(event.data.object));
  }
  return c.json({ received: true });
});
