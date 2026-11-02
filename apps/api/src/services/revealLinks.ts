import { ArtemisError, randomToken, sha256Hex } from '@artemis/shared';
import { SandboxConnector, StripeIssuingConnector } from '@artemis/connectors';
import type { CardRequestRow, CardRow } from '@artemis/db';
import type { Ctx } from './context';
import { audit } from './audit';
import { connectorForAgentConnection } from './banks';

/** Durée de vie d'un lien éphémère de carte. */
export const REVEAL_LINK_TTL_SEC = 600;

interface LinkRecord {
  cardId: string;
  requestId: string;
  orgId: string;
  expiresAt: string;
}

const key = async (token: string) => `reveal:${await sha256Hex(token)}`;

/** Crée un lien à usage unique (jeton haché en base, 10 minutes). */
export async function createRevealLink(ctx: Ctx, request: CardRequestRow, card: CardRow) {
  const token = randomToken(32);
  const expiresAt = new Date(ctx.now().getTime() + REVEAL_LINK_TTL_SEC * 1000).toISOString();
  const record: LinkRecord = { cardId: card.id, requestId: request.id, orgId: request.org_id, expiresAt };
  await ctx.store.kvSet(await key(token), record, REVEAL_LINK_TTL_SEC);
  return { url: `${ctx.env.APP_ORIGIN}/c/${token}`, expires_at: expiresAt };
}

async function loadLink(ctx: Ctx, token: string, consume: boolean) {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) throw new ArtemisError('not_found', 'Lien invalide ou expiré.');
  const k = await key(token);
  const rec = consume ? await ctx.store.kvTake<LinkRecord>(k) : await ctx.store.kvGet<LinkRecord>(k);
  if (!rec || new Date(rec.expiresAt) <= ctx.now()) throw new ArtemisError('not_found', 'Lien invalide, déjà utilisé ou expiré.');
  const card = await ctx.store.getCard(rec.cardId);
  const request = await ctx.store.getCardRequest(rec.requestId);
  if (!card || !request || card.status !== 'active' || card.revealed_at) throw new ArtemisError('not_found', 'Lien invalide, déjà utilisé ou expiré.');
  const { conn, connector } = await connectorForAgentConnection(ctx, card.bank_connection_id);
  return { rec, card, request, conn, connector };
}

/** Métadonnées affichées par la page du lien (aucune donnée sensible). */
export async function getRevealLink(ctx: Ctx, token: string) {
  const { card, request, conn, connector, rec } = await loadLink(ctx, token, false);
  return {
    provider: conn.provider,
    last4: card.last4,
    merchant: request.merchant,
    amount: Number(request.amount_cents),
    currency: request.currency,
    expires_at: rec.expiresAt,
    card_expires_at: card.expires_at,
    ...(connector instanceof StripeIssuingConnector ? { stripe: { publishableKey: connector.publishableKey ?? null, cardId: card.provider_card_id } } : {}),
  };
}

/**
 * Ouvre le lien (une seule fois) : Stripe → clé éphémère Issuing Elements (le numéro s'affiche depuis Stripe) ;
 * Sandbox → carte simulée. La carte est marquée remise.
 */
export async function openRevealSession(ctx: Ctx, token: string, nonce?: string) {
  const { card, request, connector } = await loadLink(ctx, token, true);
  const marked = await ctx.store.markCardRevealed(card.id);
  if (!marked) throw new ArtemisError('not_found', 'Lien invalide, déjà utilisé ou expiré.');
  try {
    if (connector instanceof StripeIssuingConnector) {
      if (!nonce) throw new ArtemisError('invalid_input', 'nonce Stripe requis.');
      const k = await connector.ephemeralKey(card.provider_card_id, nonce);
      await audit(ctx, request.org_id, { type: 'system', id: 'issuer_link' }, 'card.revealed', request.id, { card_id: card.id, via: 'stripe_elements' });
      return { provider: 'stripe' as const, stripe: { cardId: card.provider_card_id, publishableKey: k.publishableKey, ephemeralKeySecret: k.secret, nonce } };
    }
    if (connector instanceof SandboxConnector) {
      const d = await connector.revealCard(card.provider_card_id);
      await audit(ctx, request.org_id, { type: 'system', id: 'issuer_link' }, 'card.revealed', request.id, { card_id: card.id, via: 'sandbox' });
      return { provider: 'sandbox' as const, card: { number: d.number, exp_month: d.expMonth, exp_year: d.expYear, cvc: d.cvc, name: d.name } };
    }
    throw new ArtemisError('card_not_ready', 'Cette banque ne propose pas d’affichage sécurisé.');
  } catch (e) {
    await ctx.store.updateCard(card.id, { revealed_at: null });
    throw e;
  }
}
