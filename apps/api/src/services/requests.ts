import { ArtemisError, canonicalJson, currentBudgetMonth, monthBounds, parseRequestCardInput, sha256Hex } from '@artemis/shared';
import { evaluate } from '@artemis/policy';
import type { AgentRow, CardRequestRow } from '@artemis/db';
import type { Ctx, UserInfo } from './context';
import { audit, type Actor } from './audit';
import { policyFromRow } from './policies';
import { connectorForAgentConnection } from './banks';
import { effectivePlan, limitsFor } from './plan';
import { createRevealLink } from './revealLinks';
import { reportMeterEvent } from './billing';

export type RequestOutcome = {
  requestId: string;
  status: 'approved' | 'pending_approval' | 'rejected' | 'failed';
  reason?: string;
};

export interface MandateSignature {
  passkeyId: string;
  signature: string;
  authenticatorData: string;
  clientDataJSON: string;
}

/** Vérifie une assertion WebAuthn dont le challenge doit être `hash` ; renvoie la signature. */
export type MandateVerifier = (request: CardRequestRow, hash: string) => Promise<MandateSignature>;

const APPROVER_ROLES = new Set(['owner', 'admin', 'approver']);

export function mandatePayload(request: CardRequestRow, agent: Pick<AgentRow, 'id' | 'name'>) {
  return {
    v: 1,
    request_id: request.id,
    org_id: request.org_id,
    agent_id: agent.id,
    agent_name: agent.name,
    amount_cents: Number(request.amount_cents),
    currency: request.currency,
    merchant: request.merchant,
    purpose: request.purpose,
    expires_at: request.expires_at,
  };
}

export async function mandateHash(request: CardRequestRow, agent: Pick<AgentRow, 'id' | 'name'>) {
  return sha256Hex(canonicalJson(mandatePayload(request, agent)));
}

/** Client d'agence actif ce mois-ci : facturé 15 € une seule fois par mois (compteur Stripe). */
async function markClientActive(ctx: Ctx, org: { stripe_customer_id: string | null }, clientId: string, period: string) {
  const flag = `active-client:${clientId}:${period}`;
  if (await ctx.store.kvGet(flag)) return;
  await ctx.store.kvSet(flag, true, 40 * 86400);
  await reportMeterEvent(ctx, ctx.env.STRIPE_METER_ACTIVE_CLIENT, org.stripe_customer_id, 1, `client-${clientId}-${period}`);
}

/** Point d'entrée des agents : valide, applique les règles, crée la demande et, si besoin, l'émet. */
export async function createCardRequest(ctx: Ctx, agent: AgentRow, raw: unknown): Promise<RequestOutcome> {
  const input = parseRequestCardInput(raw);
  const { store } = ctx;
  const org = await store.getOrganization(agent.org_id);
  if (!org) throw new ArtemisError('not_found', 'Organisation introuvable.');
  if (org.frozen_at) throw new ArtemisError('org_frozen', "L'organisation est gelée.");

  const plan = effectivePlan(org);
  const limits = limitsFor(org);
  if (agent.bank_connection_id) {
    const conn = await store.getBankConnection(agent.bank_connection_id);
    if (conn && conn.provider !== 'sandbox' && plan === 'sandbox') {
      throw new ArtemisError('subscription_inactive', 'Un abonnement actif est requis pour utiliser une banque réelle.');
    }
  }

  const now = ctx.now();
  const period = currentBudgetMonth(now);
  const overQuota = (await store.getUsage(org.id, period)) >= limits.requestsPerMonth;
  if (overQuota && !limits.overage) {
    throw new ArtemisError('quota_exceeded', `Quota mensuel atteint (${limits.requestsPerMonth} demandes). Passez à un plan supérieur.`);
  }

  if (input.recurring && !limits.subscriptions) {
    throw new ArtemisError('plan_limit', 'Les abonnements gérés par agent sont inclus à partir du plan Team.');
  }
  const client = agent.client_id ? await store.getClient(agent.client_id) : null;
  if (client?.status === 'archived') throw new ArtemisError('invalid_input', `Le client ${client.name} est archivé.`);
  const policy = policyFromRow(await store.getPolicy(agent.id));
  const monthStart = monthBounds(period).start;
  const spent = await store.sumCommitted(agent.id, monthStart);
  let requestsLastHour = 0;
  if (policy.maxRequestsPerHour != null) {
    const bucket = Math.floor(now.getTime() / 3_600_000);
    const allowed = await store.hitRateLimit(`velocity:${agent.id}:${bucket}`, 3600, policy.maxRequestsPerHour);
    requestsLastHour = allowed ? 0 : policy.maxRequestsPerHour;
  }
  const recentAmounts = (await store.listCardRequests(org.id, { agentId: agent.id, limit: 40 }))
    .filter((r) => r.status === 'approved' || r.status === 'issued' || r.status === 'completed')
    .slice(0, 20)
    .map((r) => Number(r.amount_cents));
  const decision = evaluate(policy, { amountCents: input.amount, currency: input.currency, merchant: input.merchant, mcc: input.mcc }, spent, { requestsLastHour, recentAmounts });
  const flags = decision.kind === 'require_approval' ? (decision.flags ?? []) : [];

  const base = {
    org_id: org.id,
    agent_id: agent.id,
    client_id: client?.id ?? null,
    recurring_interval: input.recurring ? ('month' as const) : null,
    amount_cents: input.amount,
    currency: input.currency,
    merchant: input.merchant,
    mcc: input.mcc ?? null,
    purpose: input.purpose,
    card_ttl_minutes: input.expires_in ?? policy.cardTtlMinutes,
    expires_at: new Date(now.getTime() + policy.requestTtlMinutes * 60_000).toISOString(),
  };
  const actor: Actor = { type: 'agent', id: agent.id };

  const storeRejected = async (code: string, message: string): Promise<RequestOutcome> => {
    const row = await store.createCardRequestAtomic(
      { ...base, status: 'rejected', decision_reason: `${code}: ${message}` },
      Number.MAX_SAFE_INTEGER,
      monthStart,
    );
    await store.incrementUsage(org.id, period);
    await audit(ctx, org.id, actor, 'request.rejected', row.id, { code, amount_cents: input.amount, merchant: input.merchant });
    return { requestId: row.id, status: 'rejected', reason: `${code}: ${message}` };
  };

  if (decision.kind === 'reject') return storeRejected(decision.code, decision.message);

  let row: CardRequestRow;
  try {
    row = await store.createCardRequestAtomic(
      { ...base, status: 'pending', decision_reason: flags.length ? `flag: ${flags.join(', ')}` : null },
      policy.monthlyBudgetCents,
      monthStart,
      client?.monthly_budget_cents ?? null,
    );
  } catch (e) {
    if (e instanceof ArtemisError && e.code === 'over_monthly_budget') {
      return storeRejected('over_monthly_budget', 'Budget mensuel dépassé.');
    }
    if (e instanceof ArtemisError && e.code === 'over_client_budget') {
      return storeRejected('over_client_budget', `Budget mensuel du client ${client?.name ?? ''} dépassé.`.trim());
    }
    throw e;
  }
  if (client) ctx.defer(markClientActive(ctx, org, client.id, period));
  await store.incrementUsage(org.id, period);
  if (overQuota) {
    await store.incrementOverage(org.id, period);
    ctx.defer(reportMeterEvent(ctx, ctx.env.STRIPE_METER_OVERAGE, org.stripe_customer_id, 1, `overage-${row.id}`));
  }
  await audit(ctx, org.id, actor, 'request.created', row.id, {
    amount_cents: input.amount,
    currency: input.currency,
    merchant: input.merchant,
    purpose: input.purpose,
    ...(flags.length ? { flags } : {}),
  });

  if (decision.kind === 'auto_approve') {
    const approved = await store.updateCardRequest(row.id, { status: 'approved', decided_at: now.toISOString(), decision_reason: 'auto_approve' }, 'pending');
    if (!approved) return { requestId: row.id, status: 'pending_approval' };
    const payload = mandatePayload(approved, agent);
    await store.createMandate({
      request_id: row.id,
      org_id: org.id,
      payload,
      payload_hash: await sha256Hex(canonicalJson(payload)),
      signed_by: null,
      passkey_id: null,
      signature: null,
      authenticator_data: null,
      client_data_json: null,
      auto_approved: true,
      signed_at: now.toISOString(),
    });
    await audit(ctx, org.id, { type: 'system', id: 'policy' }, 'request.auto_approved', row.id, {});
    const issued = await issueCard(ctx, approved);
    return issued.status === 'issued'
      ? { requestId: row.id, status: 'approved' }
      : { requestId: row.id, status: 'failed', reason: issued.decision_reason ?? 'bank_error' };
  }

  ctx.defer(ctx.notify.requestPending(org.id, row.id));
  return { requestId: row.id, status: 'pending_approval' };
}

async function loadPendingForDecision(ctx: Ctx, user: UserInfo, orgId: string, requestId: string) {
  const membership = await ctx.store.getMembership(orgId, user.id);
  if (!membership || !APPROVER_ROLES.has(membership.role)) {
    throw new ArtemisError('forbidden', 'Seuls les propriétaires, administrateurs et approbateurs peuvent décider.');
  }
  const request = await ctx.store.getCardRequest(requestId);
  if (!request || request.org_id !== orgId) throw new ArtemisError('not_found', 'Demande introuvable.');
  if (request.status !== 'pending') throw new ArtemisError('request_not_pending', "Cette demande n'est plus en attente.");
  if (new Date(request.expires_at) <= ctx.now()) {
    await ctx.store.updateCardRequest(request.id, { status: 'expired' }, 'pending');
    await audit(ctx, orgId, { type: 'system', id: 'expiry' }, 'request.expired', request.id, {});
    throw new ArtemisError('request_expired', 'Cette demande a expiré.');
  }
  const agent = await ctx.store.getAgent(request.agent_id);
  if (!agent) throw new ArtemisError('not_found', 'Agent introuvable.');
  return { request, agent };
}

/** Prépare l'approbation : renvoie le hash du mandat à signer (challenge WebAuthn). */
export async function approvalChallenge(ctx: Ctx, user: UserInfo, orgId: string, requestId: string) {
  const { request, agent } = await loadPendingForDecision(ctx, user, orgId, requestId);
  return { request, agent, hash: await mandateHash(request, agent) };
}

export async function approveRequest(ctx: Ctx, user: UserInfo, orgId: string, requestId: string, verify: MandateVerifier) {
  const { request, agent } = await loadPendingForDecision(ctx, user, orgId, requestId);
  const payload = mandatePayload(request, agent);
  const hash = await sha256Hex(canonicalJson(payload));
  const policyRow = await ctx.store.getPolicy(agent.id);
  const org = await ctx.store.getOrganization(orgId);
  const required = org && limitsFor(org).quorum ? (policyRow?.approvals_required ?? 1) : 1;
  const quorumApplies = required > 1 && Number(request.amount_cents) >= Number(policyRow?.quorum_above_cents ?? 0);
  if (quorumApplies && (await ctx.store.listApprovals(request.id)).some((a) => a.user_id === user.id)) {
    throw new ArtemisError('forbidden', 'Vous avez déjà signé cette demande : un autre approbateur doit signer.');
  }
  const sig = await verify(request, hash);
  const now = ctx.now().toISOString();
  const recorded = await ctx.store.addApproval({
    request_id: request.id,
    org_id: orgId,
    user_id: user.id,
    passkey_id: sig.passkeyId,
    payload_hash: hash,
    signature: sig.signature,
    authenticator_data: sig.authenticatorData,
    client_data_json: sig.clientDataJSON,
  });
  if (!recorded) throw new ArtemisError('forbidden', 'Vous avez déjà signé cette demande : un autre approbateur doit signer.');
  if (quorumApplies) {
    const count = (await ctx.store.listApprovals(request.id)).length;
    if (count < required) {
      await audit(ctx, orgId, { type: 'user', id: user.id }, 'request.approval_recorded', request.id, { payload_hash: hash, approvals: count, required });
      return request;
    }
  }
  const approved = await ctx.store.updateCardRequest(request.id, { status: 'approved', decided_by: user.id, decided_at: now }, 'pending');
  if (!approved) throw new ArtemisError('request_not_pending', "Cette demande n'est plus en attente.");
  await ctx.store.createMandate({
    request_id: request.id,
    org_id: orgId,
    payload,
    payload_hash: hash,
    signed_by: user.id,
    passkey_id: sig.passkeyId,
    signature: sig.signature,
    authenticator_data: sig.authenticatorData,
    client_data_json: sig.clientDataJSON,
    auto_approved: false,
    signed_at: now,
  });
  await audit(ctx, orgId, { type: 'user', id: user.id }, 'request.approved', request.id, { payload_hash: hash, passkey_id: sig.passkeyId });
  return issueCard(ctx, approved);
}

export async function rejectRequest(ctx: Ctx, user: UserInfo, orgId: string, requestId: string, reason: string) {
  const { request } = await loadPendingForDecision(ctx, user, orgId, requestId);
  const updated = await ctx.store.updateCardRequest(
    request.id,
    { status: 'rejected', decided_by: user.id, decided_at: ctx.now().toISOString(), decision_reason: `human: ${reason.slice(0, 300) || 'refusée'}` },
    'pending',
  );
  if (!updated) throw new ArtemisError('request_not_pending', "Cette demande n'est plus en attente.");
  await audit(ctx, orgId, { type: 'user', id: user.id }, 'request.rejected', request.id, { reason: reason.slice(0, 300) });
  return updated;
}

/** Crée la carte à usage unique chez la banque de l'agent. En cas d'échec, la demande passe en `failed`. */
export async function issueCard(ctx: Ctx, request: CardRequestRow): Promise<CardRequestRow> {
  const agent = await ctx.store.getAgent(request.agent_id);
  try {
    const { conn, connector } = await connectorForAgentConnection(ctx, agent?.bank_connection_id ?? null);
    const recurring = request.recurring_interval === 'month';
    const ttl = request.card_ttl_minutes ?? 30;
    // Carte d'abonnement : reste active (plafond mensuel), jusqu'à résiliation.
    const expiresAt = new Date(ctx.now().getTime() + (recurring ? 400 * 86_400_000 : ttl * 60_000));
    const created = await connector.createSingleUseCard({
      amountCents: Number(request.amount_cents),
      currency: request.currency,
      merchant: request.merchant,
      expiresAt,
      label: agent?.name ?? 'agent',
      idempotencyKey: request.id,
      ...(recurring ? { recurring: 'month' as const } : {}),
    });
    const card = await ctx.store.createCard({
      request_id: request.id,
      org_id: request.org_id,
      bank_connection_id: conn.id,
      provider_card_id: created.providerCardId,
      last4: created.last4,
      exp_month: created.expMonth,
      exp_year: created.expYear,
      status: created.status,
      recurring,
      expires_at: expiresAt.toISOString(),
    });
    const updated = await ctx.store.updateCardRequest(request.id, { status: 'issued' }, 'approved');
    await audit(ctx, request.org_id, { type: 'system', id: conn.provider }, 'card.issued', request.id, {
      card_id: card.id,
      last4: card.last4,
      status: card.status,
      provider: conn.provider,
    });
    return updated ?? { ...request, status: 'issued' };
  } catch (e) {
    const message = e instanceof ArtemisError ? e.message : 'La banque a refusé la création de la carte.';
    const updated = await ctx.store.updateCardRequest(request.id, { status: 'failed', decision_reason: `bank_error: ${message}` }, 'approved');
    await audit(ctx, request.org_id, { type: 'system', id: 'bank' }, 'card.issue_failed', request.id, { message });
    ctx.defer(ctx.notify.cardIssueFailed(request.org_id, request.id));
    return updated ?? { ...request, status: 'failed', decision_reason: `bank_error: ${message}` };
  }
}

async function requestForAgent(ctx: Ctx, agent: AgentRow, requestId: string) {
  const request = await ctx.store.getCardRequest(requestId);
  if (!request || request.agent_id !== agent.id) throw new ArtemisError('not_found', 'Demande introuvable.');
  return request;
}

export async function getRequestStatus(ctx: Ctx, agent: AgentRow, requestId: string) {
  const request = await requestForAgent(ctx, agent, requestId);
  const card = await ctx.store.getCardByRequest(request.id);
  return {
    request_id: request.id,
    status: request.status,
    reason: request.decision_reason,
    amount: Number(request.amount_cents),
    currency: request.currency,
    merchant: request.merchant,
    expires_at: request.expires_at,
    card: card ? { last4: card.last4, status: card.status, expires_at: card.expires_at, revealed: !!card.revealed_at } : null,
  };
}

/** Remet les identifiants de la carte à l'agent, une seule fois. Rien n'est stocké ni journalisé. */
/** Vérifie qu'une carte est prête à être remise (demande émise, carte active, non expirée, non remise). */
async function cardReadyForAgent(ctx: Ctx, agent: AgentRow, requestId: string) {
  const request = await requestForAgent(ctx, agent, requestId);
  if (request.status === 'pending' || request.status === 'approved') {
    throw new ArtemisError('card_not_ready', 'La carte n’est pas encore émise : attendez la validation (get_request_status).');
  }
  if (request.status !== 'issued') throw new ArtemisError('request_not_pending', `Demande au statut ${request.status} : aucune carte disponible.`);
  const card = await ctx.store.getCardByRequest(request.id);
  if (!card) throw new ArtemisError('card_not_ready', 'Carte en cours de création.');
  if (card.status === 'pending_bank_sca') throw new ArtemisError('card_not_ready', 'La banque attend encore la validation de l’approbateur.');
  if (card.status !== 'active') throw new ArtemisError('request_not_pending', `Carte au statut ${card.status}.`);
  if (new Date(card.expires_at) <= ctx.now()) throw new ArtemisError('request_expired', 'La carte a expiré.');
  if (card.revealed_at) throw new ArtemisError('already_revealed', 'Les identifiants de cette carte ont déjà été remis.');
  return { request, card };
}

/**
 * Remise de la carte à l'agent selon le réglage de l'organisation :
 * - `issuer_link` (défaut) : lien éphémère à usage unique ; le numéro s'affiche depuis l'émetteur, jamais via Artemis ;
 * - `direct` (option avancée) : numéro relayé une seule fois, sans stockage.
 */
export async function deliverCardForCheckout(ctx: Ctx, agent: AgentRow, requestId: string) {
  const org = await ctx.store.getOrganization(agent.org_id);
  if (org?.card_delivery === 'direct') return revealCardForCheckout(ctx, agent, requestId);
  const { request, card } = await cardReadyForAgent(ctx, agent, requestId);
  const conn = card.bank_connection_id ? await ctx.store.getBankConnection(card.bank_connection_id) : null;
  if (!conn) throw new ArtemisError('bank_error', 'Banque introuvable pour cette carte.');
  if (conn.provider === 'qonto') {
    throw new ArtemisError('card_not_ready', "Qonto ne transmet pas la carte aux agents : l'approbateur l'affiche dans Artemis (affichage sécurisé Qonto) et finalise le paiement.");
  }
  if (conn.provider === 'revolut') {
    throw new ArtemisError('card_not_ready', "Revolut n'a pas d'affichage sécurisé : activez la remise directe (Réglages, option avancée, sous accord écrit de Revolut) ou utilisez Stripe Issuing.");
  }
  const link = await createRevealLink(ctx, request, card);
  await audit(ctx, request.org_id, { type: 'agent', id: agent.id }, 'card.link_created', request.id, { card_id: card.id, expires_at: link.expires_at });
  return {
    delivery: 'issuer_link' as const,
    checkout_url: link.url,
    expires_at: link.expires_at,
    last4: card.last4,
    amount_limit: Number(request.amount_cents),
    currency: request.currency,
    merchant: request.merchant,
    instructions: "Ouvrez ce lien une seule fois, au moment de payer : la carte s'affiche depuis l'émetteur. Ne recopiez jamais le numéro dans une réponse.",
  };
}

/** Remise directe (option avancée) : le numéro transite une fois par Artemis, sans stockage. */
export async function revealCardForCheckout(ctx: Ctx, agent: AgentRow, requestId: string) {
  const { request, card } = await cardReadyForAgent(ctx, agent, requestId);
  const { conn, connector } = await connectorForAgentConnection(ctx, card.bank_connection_id);
  if (conn.provider === 'qonto') {
    throw new ArtemisError('card_not_ready', "Qonto ne transmet pas la carte aux agents : l'approbateur l'affiche dans Artemis (affichage sécurisé Qonto) et finalise le paiement.");
  }
  const marked = await ctx.store.markCardRevealed(card.id);
  if (!marked) throw new ArtemisError('already_revealed', 'Les identifiants de cette carte ont déjà été remis.');
  let d;
  try {
    d = await connector.revealCard(card.provider_card_id);
  } catch (e) {
    // La remise unique n'est consommée que si la banque a bien renvoyé la carte.
    await ctx.store.updateCard(card.id, { revealed_at: null });
    if (e instanceof ArtemisError) throw e;
    throw new ArtemisError('bank_error', 'La banque n’a pas renvoyé la carte. Réessayez dans un instant.');
  }
  await audit(ctx, request.org_id, { type: 'agent', id: agent.id }, 'card.revealed', request.id, { card_id: card.id, last4: card.last4 });
  return {
    delivery: 'direct' as const,
    number: d.number,
    exp_month: d.expMonth,
    exp_year: d.expYear,
    cvc: d.cvc,
    cardholder_name: d.name,
    expires_at: card.expires_at,
    amount_limit: Number(request.amount_cents),
    currency: request.currency,
    merchant: request.merchant,
  };
}

/** Annule la carte d'une demande (agent ou humain). */
export async function cancelCard(ctx: Ctx, actor: Actor, orgId: string, requestId: string) {
  const request = await ctx.store.getCardRequest(requestId);
  if (!request || request.org_id !== orgId) throw new ArtemisError('not_found', 'Demande introuvable.');
  if (actor.type === 'agent' && request.agent_id !== actor.id) throw new ArtemisError('not_found', 'Demande introuvable.');
  const card = await ctx.store.getCardByRequest(request.id);
  if (card && (card.status === 'active' || card.status === 'pending_bank_sca')) {
    const { connector } = await connectorForAgentConnection(ctx, card.bank_connection_id);
    await connector.cancelCard(card.provider_card_id);
    await ctx.store.updateCard(card.id, { status: 'canceled' });
  }
  if (['pending', 'approved', 'issued'].includes(request.status)) {
    await ctx.store.updateCardRequest(request.id, { status: 'canceled' });
  }
  await audit(ctx, orgId, actor, 'card.canceled', request.id, { card_id: card?.id ?? null });
  return { status: 'canceled' as const };
}

/** Gel d'urgence : organisation gelée, agents gelés, cartes actives annulées. */
export async function freezeOrganization(ctx: Ctx, user: UserInfo, orgId: string) {
  const now = ctx.now().toISOString();
  await ctx.store.updateOrganization(orgId, { frozen_at: now });
  for (const a of await ctx.store.listAgents(orgId)) {
    if (a.status !== 'frozen') await ctx.store.updateAgent(a.id, { status: 'frozen' });
  }
  let canceled = 0;
  for (const card of await ctx.store.listCards(orgId)) {
    if (card.status !== 'active' && card.status !== 'pending_bank_sca') continue;
    try {
      const { connector } = await connectorForAgentConnection(ctx, card.bank_connection_id);
      await connector.cancelCard(card.provider_card_id);
    } catch {
      /* la carte expirera d'elle-même ; on la marque annulée côté Artemis */
    }
    await ctx.store.updateCard(card.id, { status: 'canceled' });
    await ctx.store.updateCardRequest(card.request_id, { status: 'canceled' }, 'issued');
    canceled++;
  }
  for (const r of await ctx.store.listCardRequests(orgId, { status: 'pending' })) {
    await ctx.store.updateCardRequest(r.id, { status: 'canceled' }, 'pending');
  }
  await audit(ctx, orgId, { type: 'user', id: user.id }, 'org.frozen', orgId, { canceled_cards: canceled });
  return { canceled_cards: canceled };
}

export async function unfreezeOrganization(ctx: Ctx, user: UserInfo, orgId: string) {
  await ctx.store.updateOrganization(orgId, { frozen_at: null });
  await audit(ctx, orgId, { type: 'user', id: user.id }, 'org.unfrozen', orgId, {});
}
