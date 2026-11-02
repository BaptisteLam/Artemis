import { describe, expect, it } from 'vitest';
import { encryptCredentials } from '@artemis/connectors';
import { createApp } from '../app';
import { approveRequest, createCardRequest, deliverCardForCheckout } from './requests';
import { fakeVerifier, setupWorld } from './testing';

const notion = { amount: 4900, merchant: 'Notion', purpose: 'abonnement' };

async function issued(w: Awaited<ReturnType<typeof setupWorld>>) {
  const r = await createCardRequest(w.ctx, w.agent, notion);
  await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
  return r.requestId;
}
const tokenOf = (url: string) => url.split('/c/')[1]!;

describe('issuer link (PAN never through Artemis)', () => {
  it('returns a one-time link instead of the card number', async () => {
    const w = await setupWorld({ cardDelivery: 'issuer_link' });
    const id = await issued(w);
    const out = await deliverCardForCheckout(w.ctx, w.agent, id);
    expect(out.delivery).toBe('issuer_link');
    expect(out).toMatchObject({ checkout_url: expect.stringMatching(/^http:\/\/localhost:5173\/c\/[A-Za-z0-9_-]{30,}$/) });
    expect(JSON.stringify(out)).not.toMatch(/\d{13,19}/);
    expect((await w.store.getCardByRequest(id))?.revealed_at).toBeNull();
  });

  it('opens once: metadata, then a session that consumes the link', async () => {
    const w = await setupWorld({ cardDelivery: 'issuer_link' });
    const id = await issued(w);
    const link = await deliverCardForCheckout(w.ctx, w.agent, id);
    const token = tokenOf((link as { checkout_url: string }).checkout_url);
    const app = createApp({ store: w.store, now: w.ctx.now });
    const meta = await app.request(`/v1/reveal-links/${token}`, {}, w.ctx.env);
    expect(meta.status).toBe(200);
    expect(await meta.json()).toMatchObject({ provider: 'sandbox', last4: expect.any(String), merchant: 'Notion', amount: 4900 });
    const s1 = await app.request(`/v1/reveal-links/${token}/session`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }, w.ctx.env);
    expect(s1.status).toBe(200);
    expect(((await s1.json()) as any).card.number).toMatch(/^\d{16}$/);
    expect((await w.store.getCardByRequest(id))?.revealed_at).not.toBeNull();
    const s2 = await app.request(`/v1/reveal-links/${token}/session`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }, w.ctx.env);
    expect(s2.status).toBe(404);
  });

  it('expires after 10 minutes', async () => {
    const w = await setupWorld({ cardDelivery: 'issuer_link' });
    const id = await issued(w);
    const link = (await deliverCardForCheckout(w.ctx, w.agent, id)) as { checkout_url: string };
    w.advance(11 * 60_000);
    const res = await createApp({ store: w.store, now: w.ctx.now }).request(`/v1/reveal-links/${tokenOf(link.checkout_url)}`, {}, w.ctx.env);
    expect(res.status).toBe(404);
  });

  it('Stripe: returns an ephemeral key for Issuing Elements, never the number', async () => {
    const w = await setupWorld({ cardDelivery: 'issuer_link' });
    const conn = await w.store.createBankConnection({
      org_id: w.org.id,
      provider: 'stripe',
      label: 'Stripe',
      credentials_ciphertext: await encryptCredentials({ secretKey: 'sk_test', cardholderId: 'ich_1', publishableKey: 'pk_test_1' }, w.ctx.env.CONNECTIONS_KEY),
    });
    const r = await w.store.createCardRequestAtomic({ org_id: w.org.id, agent_id: w.agent.id, amount_cents: 4900, currency: 'EUR', merchant: 'Notion', mcc: null, purpose: 'x', card_ttl_minutes: 30, expires_at: '2099-01-01T00:00:00Z', status: 'issued' }, 1e9, new Date(0));
    await w.store.createCard({ request_id: r.id, org_id: w.org.id, bank_connection_id: conn.id, provider_card_id: 'ic_9', last4: '4242', exp_month: 1, exp_year: 2030, status: 'active', expires_at: '2099-01-01T00:00:00Z' });
    const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify({ id: 'ephkey_1', secret: 'ek_test_secret' }), { status: 200 });
    }) as unknown as typeof fetch;
    const link = (await deliverCardForCheckout(w.ctx, w.agent, r.id)) as { checkout_url: string };
    const app = createApp({ store: w.store, now: w.ctx.now, fetch: f });
    const meta = (await (await app.request(`/v1/reveal-links/${tokenOf(link.checkout_url)}`, {}, w.ctx.env)).json()) as any;
    expect(meta).toMatchObject({ provider: 'stripe', stripe: { publishableKey: 'pk_test_1', cardId: 'ic_9' } });
    const res = await app.request(`/v1/reveal-links/${tokenOf(link.checkout_url)}/session`, { method: 'POST', body: JSON.stringify({ nonce: 'ephkeynonce_1' }), headers: { 'Content-Type': 'application/json' } }, w.ctx.env);
    const body = (await res.json()) as any;
    expect(body).toEqual({ provider: 'stripe', stripe: { cardId: 'ic_9', publishableKey: 'pk_test_1', ephemeralKeySecret: 'ek_test_secret', nonce: 'ephkeynonce_1' } });
    expect(calls[0]!.url).toBe('https://api.stripe.com/v1/ephemeral_keys');
    const p = new URLSearchParams(calls[0]!.body);
    expect(p.get('issuing_card')).toBe('ic_9');
    expect(p.get('nonce')).toBe('ephkeynonce_1');
    expect(calls[0]!.headers['Stripe-Version']).toBeTruthy();
  });

  it('direct mode (advanced option) still hands the card once', async () => {
    const w = await setupWorld({ cardDelivery: 'direct' });
    const id = await issued(w);
    const out = await deliverCardForCheckout(w.ctx, w.agent, id);
    expect(out.delivery).toBe('direct');
    expect((out as { number: string }).number).toMatch(/^\d{16}$/);
  });

  it('Revolut needs the direct option', async () => {
    const w = await setupWorld({ cardDelivery: 'issuer_link' });
    const conn = await w.store.createBankConnection({ org_id: w.org.id, provider: 'revolut', label: 'Revolut', credentials_ciphertext: await encryptCredentials({ accessToken: 't', environment: 'production' }, w.ctx.env.CONNECTIONS_KEY) });
    const r = await w.store.createCardRequestAtomic({ org_id: w.org.id, agent_id: w.agent.id, amount_cents: 4900, currency: 'EUR', merchant: 'Notion', mcc: null, purpose: 'x', card_ttl_minutes: 30, expires_at: '2099-01-01T00:00:00Z', status: 'issued' }, 1e9, new Date(0));
    await w.store.createCard({ request_id: r.id, org_id: w.org.id, bank_connection_id: conn.id, provider_card_id: 'rv_1', last4: '1111', exp_month: 1, exp_year: 2030, status: 'active', expires_at: '2099-01-01T00:00:00Z' });
    await expect(deliverCardForCheckout(w.ctx, w.agent, r.id)).rejects.toMatchObject({ code: 'card_not_ready' });
  });
});
