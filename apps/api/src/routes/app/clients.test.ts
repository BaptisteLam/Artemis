import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { devUserId } from '../../http/auth';
import { createCardRequest, approveRequest } from '../../services/requests';
import { fakeVerifier, setupWorld } from '../../services/testing';
import { applyBankTransaction } from '../../services/reconcile';

async function agencyWorld(plan: 'agency' | 'team' = 'agency') {
  const w = await setupWorld({ plan });
  const boss = await devUserId('boss@agence.fr');
  await w.store.addMembership({ org_id: w.org.id, user_id: boss, email: 'boss@agence.fr', role: 'owner' });
  const app = createApp({ store: w.store, now: w.ctx.now });
  const as = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { Authorization: 'Dev boss@agence.fr', 'X-Org-Id': w.org.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }, w.ctx.env);
  return { w, as };
}
const json = async (r: Response) => (await r.json()) as any;

describe('agency mode', () => {
  it('creates clients, attaches an agent and enforces the client budget', async () => {
    const { w, as } = await agencyWorld();
    const res = await as('POST', '/app/clients', { name: 'Boulangerie Martin', billing_email: 'compta@martin.fr', markup_pct: 10, monthly_budget_cents: 5000 });
    expect(res.status).toBe(201);
    const client = (await json(res)).client;
    expect((await as('PATCH', `/app/agents/${w.agent.id}`, { client_id: client.id })).status).toBe(200);
    const agent = (await w.store.getAgent(w.agent.id))!;
    const a = await createCardRequest(w.ctx, agent, { amount: 3000, merchant: 'Notion', purpose: 'x' });
    expect(a.status).toBe('pending_approval');
    expect((await w.store.getCardRequest(a.requestId))?.client_id).toBe(client.id);
    const b = await createCardRequest(w.ctx, agent, { amount: 3000, merchant: 'Notion', purpose: 'x' });
    expect(b.status).toBe('rejected');
    expect(b.reason).toMatch(/over_client_budget/);
  });

  it('builds the monthly rebilling report with markup', async () => {
    const { w, as } = await agencyWorld();
    const client = (await json(await as('POST', '/app/clients', { name: 'Client B', markup_pct: 15 }))).client;
    await as('PATCH', `/app/agents/${w.agent.id}`, { client_id: client.id });
    const agent = (await w.store.getAgent(w.agent.id))!;
    const r = await createCardRequest(w.ctx, agent, { amount: 10000, merchant: 'Notion', purpose: 'abonnement' });
    await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    const card = (await w.store.getCardByRequest(r.requestId))!;
    await applyBankTransaction(w.ctx, (await w.store.getBankConnection(w.conn.id))!, {
      providerTxId: 'tx1', providerCardId: card.provider_card_id, amountCents: 10000, currency: 'EUR', merchantName: 'Notion', status: 'posted', occurredAt: w.ctx.now(),
    });
    const rep = await json(await as('GET', `/app/clients/${client.id}/report?month=2026-11`));
    expect(rep.lines).toHaveLength(1);
    expect(rep).toMatchObject({ subtotal_cents: 10000, markup_pct: 15, markup_cents: 1500, total_cents: 11500 });
    const csv = await (await as('GET', `/app/clients/${client.id}/report?month=2026-11&format=csv`)).text();
    expect(csv).toContain('Notion');
    expect(csv).toContain('115,00');
  });

  it('is reserved to plans with clients', async () => {
    const { as } = await agencyWorld('team');
    const res = await as('POST', '/app/clients', { name: 'X' });
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe('plan_limit');
  });

  it('refuses a client from another organisation', async () => {
    const { w, as } = await agencyWorld();
    const other = await setupWorld({ plan: 'agency' });
    const foreign = await other.store.createClient({ org_id: other.org.id, name: 'Autre', billing_email: null, markup_pct: 0, monthly_budget_cents: null });
    expect((await as('PATCH', `/app/agents/${w.agent.id}`, { client_id: foreign.id })).status).toBe(400);
  });
});
