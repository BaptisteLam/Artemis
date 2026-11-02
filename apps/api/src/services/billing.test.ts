import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { devUserId } from '../http/auth';
import { setupWorld } from './testing';
import { signStripePayload } from './stripeSignature';

const env = (w: Awaited<ReturnType<typeof setupWorld>>) => ({
  ...w.ctx.env,
  STRIPE_SECRET_KEY: 'sk_test_billing',
  STRIPE_WEBHOOK_SECRET: 'whsec_billing',
  STRIPE_PRICE_BUILDER: 'price_builder',
  STRIPE_PRICE_TEAM: 'price_team',
  STRIPE_PRICE_BUSINESS: 'price_business',
});

async function hook(w: Awaited<ReturnType<typeof setupWorld>>, event: unknown, secret = 'whsec_billing') {
  const body = JSON.stringify(event);
  const sig = await signStripePayload(body, secret, Math.floor(Date.now() / 1000));
  return createApp({ store: w.store }).request('/webhooks/stripe-billing', { method: 'POST', body, headers: { 'Stripe-Signature': sig } }, env(w));
}

describe('billing', () => {
  it('creates a Checkout session for the chosen plan', async () => {
    const w = await setupWorld({ plan: 'sandbox' });
    const owner = await devUserId('boss@exemple.fr');
    await w.store.addMembership({ org_id: w.org.id, user_id: owner, email: 'boss@exemple.fr', role: 'owner' });
    const calls: { url: string; body: string }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay_123' }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await createApp({ store: w.store, fetch: f }).request('/app/billing/checkout', {
      method: 'POST',
      headers: { Authorization: 'Dev boss@exemple.fr', 'X-Org-Id': w.org.id, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'team' }),
    }, env(w));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).url).toBe('https://checkout.stripe.com/c/pay_123');
    const p = new URLSearchParams(calls[0]!.body);
    expect(calls[0]!.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(p.get('mode')).toBe('subscription');
    expect(p.get('line_items[0][price]')).toBe('price_team');
    expect(p.get('client_reference_id')).toBe(w.org.id);
    expect(p.get('locale')).toBe('fr');
  });

  it('adds the metered overage and active-client prices to an Agency checkout', async () => {
    const w = await setupWorld({ plan: 'sandbox' });
    const owner = await devUserId('boss@exemple.fr');
    await w.store.addMembership({ org_id: w.org.id, user_id: owner, email: 'boss@exemple.fr', role: 'owner' });
    const bodies: string[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/x' }), { status: 200 });
    }) as unknown as typeof fetch;
    const e = { ...env(w), STRIPE_PRICE_AGENCY: 'price_agency', STRIPE_PRICE_OVERAGE: 'price_overage', STRIPE_PRICE_ACTIVE_CLIENT: 'price_client' };
    const call = (plan: string) =>
      createApp({ store: w.store, fetch: f }).request('/app/billing/checkout', {
        method: 'POST',
        headers: { Authorization: 'Dev boss@exemple.fr', 'X-Org-Id': w.org.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      }, e);
    expect((await call('agency')).status).toBe(200);
    let p = new URLSearchParams(bodies[0]!);
    expect(p.get('line_items[0][price]')).toBe('price_agency');
    expect(p.get('line_items[1][price]')).toBe('price_overage');
    expect(p.get('line_items[1][quantity]')).toBeNull();
    expect(p.get('line_items[2][price]')).toBe('price_client');
    expect((await call('business')).status).toBe(200);
    p = new URLSearchParams(bodies[1]!);
    expect(p.get('line_items[0][price]')).toBe('price_business');
    expect(p.has('line_items[1][price]')).toBe(false);
  });

  it('finds the plan even when a metered price comes first', async () => {
    const w = await setupWorld({ plan: 'sandbox' });
    await w.store.updateOrganization(w.org.id, { stripe_customer_id: 'cus_2' });
    await hook(w, { type: 'customer.subscription.updated', data: { object: { id: 'sub_2', customer: 'cus_2', status: 'active', items: { data: [{ price: { id: 'price_overage' } }, { price: { id: 'price_builder' } }] }, metadata: {} } } });
    expect(await w.store.getOrganization(w.org.id)).toMatchObject({ plan: 'builder' });
  });

  it('activates the plan from a signed subscription event', async () => {
    const w = await setupWorld({ plan: 'sandbox' });
    await w.store.updateOrganization(w.org.id, { stripe_customer_id: 'cus_1' });
    const res = await hook(w, { type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [{ price: { id: 'price_team' } }] }, metadata: {} } } });
    expect(res.status).toBe(200);
    const org = await w.store.getOrganization(w.org.id);
    expect(org).toMatchObject({ plan: 'team', subscription_status: 'active', stripe_subscription_id: 'sub_1' });
  });

  it('links the customer on checkout completion', async () => {
    const w = await setupWorld({ plan: 'sandbox' });
    await hook(w, { type: 'checkout.session.completed', data: { object: { client_reference_id: w.org.id, customer: 'cus_9', subscription: 'sub_9', metadata: { plan: 'builder' } } } });
    expect(await w.store.getOrganization(w.org.id)).toMatchObject({ stripe_customer_id: 'cus_9', plan: 'builder', subscription_status: 'active' });
  });

  it('falls back to sandbox when the subscription is deleted', async () => {
    const w = await setupWorld({ plan: 'team' });
    await w.store.updateOrganization(w.org.id, { stripe_customer_id: 'cus_1' });
    await hook(w, { type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', items: { data: [{ price: { id: 'price_team' } }] } } } });
    expect(await w.store.getOrganization(w.org.id)).toMatchObject({ plan: 'sandbox', subscription_status: 'canceled' });
  });

  it('rejects an invalid signature', async () => {
    const w = await setupWorld();
    expect((await hook(w, { type: 'customer.subscription.updated' }, 'whsec_wrong')).status).toBe(400);
  });
});
