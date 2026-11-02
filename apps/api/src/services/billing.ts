import { ArtemisError, PLAN_LIMITS, type Plan } from '@artemis/shared';
import { formEncode } from '@artemis/connectors';
import type { OrganizationRow } from '@artemis/db';
import type { Ctx } from './context';
import { audit } from './audit';

const PAID: Exclude<Plan, 'sandbox'>[] = ['builder', 'team', 'agency', 'business'];

function priceFor(ctx: Ctx, plan: Exclude<Plan, 'sandbox'>): string {
  const price = { builder: ctx.env.STRIPE_PRICE_BUILDER, team: ctx.env.STRIPE_PRICE_TEAM, agency: ctx.env.STRIPE_PRICE_AGENCY, business: ctx.env.STRIPE_PRICE_BUSINESS }[plan];
  if (!price || !ctx.env.STRIPE_SECRET_KEY) throw new ArtemisError('invalid_input', 'La facturation n’est pas encore configurée (Stripe).');
  return price;
}

function planForPrice(ctx: Ctx, priceId: string | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === ctx.env.STRIPE_PRICE_BUILDER) return 'builder';
  if (priceId === ctx.env.STRIPE_PRICE_TEAM) return 'team';
  if (priceId === ctx.env.STRIPE_PRICE_AGENCY) return 'agency';
  if (priceId === ctx.env.STRIPE_PRICE_BUSINESS) return 'business';
  return null;
}

async function stripe<T>(ctx: Ctx, path: string, params: Record<string, unknown>): Promise<T> {
  const res = await ctx.fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formEncode(params).toString(),
  });
  if (!res.ok) throw new ArtemisError('bank_error', `Stripe a refusé la demande (${res.status}).`);
  return (await res.json()) as T;
}

export async function createCheckout(ctx: Ctx, org: OrganizationRow, email: string, plan: string) {
  if (!PAID.includes(plan as never)) throw new ArtemisError('invalid_input', 'Plan inconnu.');
  const price = priceFor(ctx, plan as Exclude<Plan, 'sandbox'>);
  // Prix à l'usage (compteurs Stripe) : sans eux, les événements de compteur ne sont jamais facturés.
  const lineItems: Record<string, unknown>[] = [{ price, quantity: 1 }];
  if (ctx.env.STRIPE_PRICE_OVERAGE && Number.isFinite(PLAN_LIMITS[plan as Plan].requestsPerMonth)) lineItems.push({ price: ctx.env.STRIPE_PRICE_OVERAGE });
  if (ctx.env.STRIPE_PRICE_ACTIVE_CLIENT && plan === 'agency') lineItems.push({ price: ctx.env.STRIPE_PRICE_ACTIVE_CLIENT });
  const session = await stripe<{ url: string }>(ctx, '/checkout/sessions', {
    mode: 'subscription',
    line_items: lineItems,
    success_url: `${ctx.env.APP_ORIGIN}/billing?status=ok`,
    cancel_url: `${ctx.env.APP_ORIGIN}/billing?status=canceled`,
    client_reference_id: org.id,
    customer: org.stripe_customer_id ?? undefined,
    customer_email: org.stripe_customer_id ? undefined : email,
    locale: 'fr',
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    metadata: { org_id: org.id, plan },
    subscription_data: { metadata: { org_id: org.id, plan } },
  });
  return session.url;
}

export async function createPortal(ctx: Ctx, org: OrganizationRow) {
  if (!org.stripe_customer_id) throw new ArtemisError('invalid_input', 'Aucun abonnement à gérer.');
  if (!ctx.env.STRIPE_SECRET_KEY) throw new ArtemisError('invalid_input', 'La facturation n’est pas encore configurée (Stripe).');
  const s = await stripe<{ url: string }>(ctx, '/billing_portal/sessions', { customer: org.stripe_customer_id, return_url: `${ctx.env.APP_ORIGIN}/billing` });
  return s.url;
}

type Sub = { id: string; customer: string; status: string; items?: { data: { price: { id: string } }[] }; metadata?: Record<string, string> };

/** Applique un événement Stripe Billing (signature déjà vérifiée). */
export async function handleBillingEvent(ctx: Ctx, event: { type: string; data: { object: Record<string, unknown> } }) {
  const { store } = ctx;
  const sys = { type: 'system' as const, id: 'stripe-billing' };
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as { client_reference_id?: string; customer?: string; subscription?: string; metadata?: Record<string, string> };
    const orgId = s.client_reference_id ?? s.metadata?.org_id;
    if (!orgId || !(await store.getOrganization(orgId))) return;
    const plan = PAID.includes(s.metadata?.plan as never) ? (s.metadata!.plan as Plan) : undefined;
    await store.updateOrganization(orgId, {
      stripe_customer_id: s.customer ?? null,
      stripe_subscription_id: s.subscription ?? null,
      subscription_status: 'active',
      ...(plan ? { plan } : {}),
    });
    await audit(ctx, orgId, sys, 'billing.subscribed', orgId, { plan: plan ?? null });
    return;
  }
  if (event.type.startsWith('customer.subscription.')) {
    const sub = event.data.object as Sub;
    let org = await store.findOrganizationByStripeCustomer(sub.customer);
    if (!org && sub.metadata?.org_id) org = await store.getOrganization(sub.metadata.org_id);
    if (!org) return;
    const deleted = event.type === 'customer.subscription.deleted';
    const plan = deleted ? 'sandbox' : ((sub.items?.data ?? []).map((i) => planForPrice(ctx, i.price.id)).find((p) => p) ?? org.plan);
    await store.updateOrganization(org.id, {
      plan,
      subscription_status: deleted ? 'canceled' : sub.status,
      stripe_subscription_id: sub.id,
      stripe_customer_id: sub.customer,
    });
    await audit(ctx, org.id, sys, 'billing.updated', org.id, { plan, status: deleted ? 'canceled' : sub.status });
  }
}

/** Envoie un événement de compteur Stripe (facturation à l'usage). Silencieux si non configuré. */
export async function reportMeterEvent(ctx: Ctx, eventName: string | undefined, customerId: string | null, value = 1, identifier?: string) {
  if (!eventName || !customerId || !ctx.env.STRIPE_SECRET_KEY) return;
  await stripe(ctx, '/billing/meter_events', {
    event_name: eventName,
    payload: { stripe_customer_id: customerId, value: String(value) },
    identifier,
  });
}
