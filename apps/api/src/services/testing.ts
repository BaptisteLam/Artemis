import { generateAgentToken } from '@artemis/shared';
import { encryptCredentials, newSandboxState } from '@artemis/connectors';
import { TEST_ENV } from '../env';
import { MemoryStore } from '../store/memory';
import type { Ctx, Notifier } from './context';
import type { Plan } from '@artemis/shared';

/** Fabrique un contexte de test complet : organisation, banque Sandbox, agent, membres. */
export async function setupWorld(opts: { plan?: Plan; policy?: Record<string, unknown> } = {}) {
  const store = new MemoryStore();
  const calls: string[] = [];
  const notify: Notifier = {
    async requestPending(_o, id) { calls.push(`pending:${id}`); },
    async cardIssueFailed(_o, id) { calls.push(`failed:${id}`); },
    async transactionMismatch(_o, id) { calls.push(`mismatch:${id}`); },
    async invitation(email) { calls.push(`invite:${email}`); },
  };
  let clock = new Date('2026-11-10T10:00:00Z');
  const deferred: Promise<unknown>[] = [];
  const ctx: Ctx = {
    env: TEST_ENV,
    store,
    now: () => clock,
    fetch: (async () => new Response('{}')) as unknown as typeof fetch,
    notify,
    defer: (p) => void deferred.push(p),
  };
  const org = await store.updateOrganization((await store.createOrganization({ name: 'Studio Lumen' })).id, {
    plan: opts.plan ?? 'team',
    subscription_status: opts.plan === 'sandbox' ? null : 'active',
  });
  const conn = await store.createBankConnection({
    org_id: org.id,
    provider: 'sandbox',
    label: 'Banque simulée',
    credentials_ciphertext: await encryptCredentials(newSandboxState(), TEST_ENV.CONNECTIONS_KEY),
  });
  const t = await generateAgentToken('test');
  const agent = await store.createAgent({ org_id: org.id, name: 'notion.agent', platform: 'claude', token_hash: t.hash, token_prefix: t.prefix, bank_connection_id: conn.id });
  await store.upsertPolicy({
    agent_id: agent.id,
    monthly_budget_cents: 50000,
    per_tx_limit_cents: 10000,
    currencies: ['EUR'],
    merchant_allow: [],
    merchant_deny: [],
    mcc_allow: [],
    mcc_deny: [],
    auto_approve_below_cents: 0,
    card_ttl_minutes: 30,
    request_ttl_minutes: 30,
    freeze_on_mismatch: false,
    ...opts.policy,
  });
  const owner = { id: 'u-owner', email: 'owner@exemple.fr', isAdmin: false };
  const viewer = { id: 'u-viewer', email: 'viewer@exemple.fr', isAdmin: false };
  await store.addMembership({ org_id: org.id, user_id: owner.id, email: owner.email, role: 'owner' });
  await store.addMembership({ org_id: org.id, user_id: viewer.id, email: viewer.email, role: 'viewer' });
  return {
    store, ctx, org, conn, agent, token: t.token, owner, viewer, calls,
    advance: (ms: number) => void (clock = new Date(clock.getTime() + ms)),
    flush: () => Promise.all(deferred),
  };
}

export const fakeVerifier = async (_req: unknown, hash: string) => ({
  passkeyId: 'pk-1',
  signature: `sig:${hash}`,
  authenticatorData: 'ad',
  clientDataJSON: 'cd',
});
