import { describe, expect, it } from 'vitest';
import { encryptCredentials } from '@artemis/connectors';
import { createApp } from '../app';
import { createCardRequest, revealCardForCheckout } from '../services/requests';
import { setupWorld } from '../services/testing';
import { signStripePayload } from '../services/stripeSignature';

async function stripeWorld() {
  const w = await setupWorld();
  const conn = await w.store.createBankConnection({
    org_id: w.org.id,
    provider: 'stripe',
    label: 'Stripe Issuing',
    credentials_ciphertext: await encryptCredentials({ secretKey: 'sk_test', cardholderId: 'ich_1', webhookSecret: 'whsec_test' }, w.ctx.env.CONNECTIONS_KEY),
  });
  const r = await w.store.createCardRequestAtomic({ org_id: w.org.id, agent_id: w.agent.id, amount_cents: 4900, currency: 'EUR', merchant: 'Notion', mcc: null, purpose: 'x', card_ttl_minutes: 30, expires_at: '2099-01-01T00:00:00Z', status: 'issued' }, 1e9, new Date(0));
  await w.store.createCard({ request_id: r.id, org_id: w.org.id, bank_connection_id: conn.id, provider_card_id: 'ic_1', last4: '4242', exp_month: 1, exp_year: 2030, status: 'active', expires_at: '2099-01-01T00:00:00Z' });
  return { w, conn, r };
}

const event = JSON.stringify({ type: 'issuing_transaction.created', data: { object: { id: 'ipi_1', card: 'ic_1', amount: -4900, currency: 'eur', type: 'capture', created: 1793000000, merchant_data: { name: 'NOTION LABS' } } } });

describe('Stripe Issuing webhook', () => {
  it('rejects an invalid signature', async () => {
    const { w, conn } = await stripeWorld();
    const res = await createApp({ store: w.store }).request(`/webhooks/stripe-issuing/${conn.id}`, { method: 'POST', body: event, headers: { 'Stripe-Signature': 't=1,v1=deadbeef' } }, w.ctx.env);
    expect(res.status).toBe(400);
  });
  it('records and reconciles a signed transaction', async () => {
    const { w, conn, r } = await stripeWorld();
    const sig = await signStripePayload(event, 'whsec_test', Math.floor(Date.now() / 1000));
    const res = await createApp({ store: w.store }).request(`/webhooks/stripe-issuing/${conn.id}`, { method: 'POST', body: event, headers: { 'Stripe-Signature': sig } }, w.ctx.env);
    expect(res.status).toBe(200);
    expect((await w.store.listTransactions(w.org.id))[0]?.match_status).toBe('matched');
    expect((await w.store.getCardRequest(r.id))?.status).toBe('completed');
  });
});

describe('Qonto cards', () => {
  it('refuses to reveal without consuming the single reveal', async () => {
    const w = await setupWorld();
    const conn = await w.store.createBankConnection({ org_id: w.org.id, provider: 'qonto', label: 'Qonto', credentials_ciphertext: await encryptCredentials({ accessToken: 't', environment: 'production' }, w.ctx.env.CONNECTIONS_KEY) });
    const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant: 'Notion', purpose: 'x' });
    await w.store.updateCardRequest(r.requestId, { status: 'issued' });
    const card = await w.store.createCard({ request_id: r.requestId, org_id: w.org.id, bank_connection_id: conn.id, provider_card_id: 'qc_1', last4: '1111', exp_month: 1, exp_year: 2030, status: 'active', expires_at: '2099-01-01T00:00:00Z' });
    await expect(revealCardForCheckout(w.ctx, w.agent, r.requestId)).rejects.toMatchObject({ code: 'card_not_ready' });
    expect((await w.store.getCard(card.id))?.revealed_at).toBeNull();
  });
});
