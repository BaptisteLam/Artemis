import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { TEST_ENV } from '../../env';
import { MemoryStore } from '../../store/memory';
import { approveRequest } from '../../services/requests';
import { fakeVerifier } from '../../services/testing';
import { buildCtx } from '../../app';
import { devUserId } from '../../http/auth';

let store: MemoryStore;
const json = async (r: Response) => (await r.json()) as any;

function client(email: string, orgId?: string) {
  const app = createApp({ store });
  return (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { Authorization: `Dev ${email}`, 'Content-Type': 'application/json', ...(orgId ? { 'X-Org-Id': orgId } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, TEST_ENV);
}

async function newOrg(email = 'alice@exemple.fr', name = 'Studio Lumen') {
  const res = await client(email)('POST', '/app/orgs', { name });
  expect(res.status).toBe(201);
  const org = (await json(res)).organization;
  return { org, as: client(email, org.id) };
}

beforeEach(() => void (store = new MemoryStore()));

describe('app routes', () => {
  it('creates an organisation with a sandbox bank and an owner', async () => {
    const { org, as } = await newOrg();
    expect(org.plan).toBe('sandbox');
    const conns = await json(await as('GET', '/app/connections'));
    expect(conns.connections).toHaveLength(1);
    expect(conns.connections[0].provider).toBe('sandbox');
    const me = await json(await client('alice@exemple.fr')('GET', '/app/me'));
    expect(me.organizations[0].role).toBe('owner');
  });

  it('never returns bank credentials', async () => {
    const { as } = await newOrg();
    const text = await (await as('GET', '/app/connections')).text();
    expect(text).not.toContain('credentials');
    expect(text).not.toContain('v1.');
  });

  it('creates an agent, shows its token once, applies plan limits', async () => {
    const { as } = await newOrg();
    const res = await as('POST', '/app/agents', { name: 'notion.agent', platform: 'claude' });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.token).toMatch(/^art_test_/);
    const list = await (await as('GET', '/app/agents')).text();
    expect(list).not.toContain(body.token);
    expect(list).not.toContain('token_hash');
    const second = await as('POST', '/app/agents', { name: 'deux.agent', platform: 'n8n' });
    expect(second.status).toBe(403);
    expect((await json(second)).error.code).toBe('plan_limit');
  });

  it('forbids viewers from creating agents and outsiders from reading', async () => {
    const { org, as } = await newOrg();
    await store.addMembership({ org_id: org.id, user_id: await devUserId('val@exemple.fr'), email: 'val@exemple.fr', role: 'viewer' });
    expect((await client('val@exemple.fr', org.id)('POST', '/app/agents', { name: 'x', platform: 'api' })).status).toBe(403);
    expect((await client('mallory@exemple.fr', org.id)('GET', '/app/agents')).status).toBe(403);
    expect((await as('GET', '/app/agents')).status).toBe(200);
  });

  it('validates and saves a policy in cents', async () => {
    const { as } = await newOrg();
    const agent = (await json(await as('POST', '/app/agents', { name: 'a', platform: 'claude' }))).agent;
    const bad = await as('PUT', `/app/agents/${agent.id}/policy`, { card_ttl_minutes: 99999 });
    expect(bad.status).toBe(400);
    const ok = await as('PUT', `/app/agents/${agent.id}/policy`, { monthly_budget_cents: 20000, merchant_allow: ['Notion'], auto_approve_below_cents: 1000 });
    expect(ok.status).toBe(200);
    expect((await json(ok)).policy.monthly_budget_cents).toBe(20000);
  });

  it('invites and accepts a member', async () => {
    const { org, as } = await newOrg();
    const inv = await json(await as('POST', '/app/invitations', { email: 'bob@exemple.fr', role: 'approver' }));
    const token = new URL(inv.link).searchParams.get('token');
    const acc = await client('bob@exemple.fr')('POST', '/app/invitations/accept', { token });
    expect(acc.status).toBe(200);
    const members = await json(await as('GET', '/app/members'));
    expect(members.members.map((m: any) => m.role).sort()).toEqual(['approver', 'owner']);
    expect((await client('eve@exemple.fr')('POST', '/app/invitations/accept', { token })).status).toBe(400);
    expect(org.id).toBeTruthy();
  });

  it('refuses to remove the last owner', async () => {
    const { as } = await newOrg();
    const res = await as('DELETE', `/app/members/${await devUserId('alice@exemple.fr')}`);
    expect(res.status).toBe(400);
  });

  it('simulates a sandbox payment that gets reconciled, then exports CSV but gates FEC', async () => {
    const { org, as } = await newOrg();
    const { agent } = await json(await as('POST', '/app/agents', { name: 'notion.agent', platform: 'claude' }));
    const ctx = buildCtx(TEST_ENV, { store }, () => {});
    const { createCardRequest } = await import('../../services/requests');
    const r = await createCardRequest(ctx, (await store.getAgent(agent.id))!, { amount: 4900, merchant: 'Notion', purpose: 'abonnement' });
    const owner = { id: await devUserId('alice@exemple.fr'), email: 'alice@exemple.fr', isAdmin: false };
    await approveRequest(ctx, owner, org.id, r.requestId, fakeVerifier);
    const sim = await as('POST', '/app/sandbox/simulate-payment', { request_id: r.requestId });
    expect(sim.status).toBe(200);
    expect((await json(sim)).transaction.match_status).toBe('matched');
    const detail = await json(await as('GET', `/app/requests/${r.requestId}`));
    expect(detail.request.status).toBe('completed');
    expect(detail.mandate.signature).toBeTruthy();
    const csv = await as('GET', '/app/exports/csv?from=2020-01-01&to=2100-01-01');
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain('Notion;49,00;EUR');
    const fec = await as('GET', '/app/exports/fec?from=2020-01-01&to=2100-01-01');
    expect(fec.status).toBe(403);
    await store.updateOrganization(org.id, { plan: 'team', subscription_status: 'active' });
    const fec2 = await as('GET', '/app/exports/fec?from=2020-01-01&to=2100-01-01');
    expect((await fec2.text()).split('\r\n')[0]).toContain('JournalCode');
  });

  it('freeze cancels active cards and blocks agents', async () => {
    const { org, as } = await newOrg();
    const { agent, token } = await json(await as('POST', '/app/agents', { name: 'a', platform: 'claude' }));
    const ctx = buildCtx(TEST_ENV, { store }, () => {});
    const { createCardRequest } = await import('../../services/requests');
    const r = await createCardRequest(ctx, (await store.getAgent(agent.id))!, { amount: 4900, merchant: 'Notion', purpose: 'x' });
    await approveRequest(ctx, { id: await devUserId('alice@exemple.fr'), email: 'alice@exemple.fr', isAdmin: false }, org.id, r.requestId, fakeVerifier);
    expect((await as('POST', '/app/freeze')).status).toBe(200);
    expect((await store.getCardByRequest(r.requestId))?.status).toBe('canceled');
    const agentCall = await createApp({ store }).request('/v1/budgets', { headers: { Authorization: `Bearer ${token}` } }, TEST_ENV);
    expect(agentCall.status).toBe(403);
  });

  it('dashboard summarises the month', async () => {
    const { as } = await newOrg();
    const d = await json(await as('GET', '/app/dashboard'));
    expect(d).toMatchObject({ spent_this_month: 0, pending_count: 0, plan: 'sandbox' });
  });

  it('audit verify reports an intact chain', async () => {
    const { as } = await newOrg();
    await as('POST', '/app/agents', { name: 'a', platform: 'claude' });
    const v = await json(await as('GET', '/app/audit/verify'));
    expect(v.ok).toBe(true);
    expect(v.count).toBeGreaterThan(0);
  });
});
