import { describe, expect, it } from 'vitest';
import { encryptCredentials } from '@artemis/connectors';
import { approveRequest, createCardRequest } from './requests';
import { createNotifier } from './notify';
import { fakeVerifier, setupWorld } from './testing';

const notion = { amount: 20000, merchant: 'Notion', purpose: 'licence annuelle' };

describe('quorum', () => {
  it('needs two distinct approvers above the threshold', async () => {
    const w = await setupWorld({ policy: { approvals_required: 2, quorum_above_cents: 10000, per_tx_limit_cents: 50000 } });
    const second = { id: 'u-second', email: 'second@exemple.fr', isAdmin: false };
    await w.store.addMembership({ org_id: w.org.id, user_id: second.id, email: second.email, role: 'approver' });
    const r = await createCardRequest(w.ctx, w.agent, notion);
    const first = await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    expect(first.status).toBe('pending');
    expect((await w.store.listApprovals(r.requestId))).toHaveLength(1);
    await expect(approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier)).rejects.toMatchObject({ code: 'forbidden' });
    const done = await approveRequest(w.ctx, second, w.org.id, r.requestId, fakeVerifier);
    expect(done.status).toBe('issued');
    expect((await w.store.listApprovals(r.requestId))).toHaveLength(2);
  });

  it('a single approval is enough below the threshold', async () => {
    const w = await setupWorld({ policy: { approvals_required: 2, quorum_above_cents: 50000, per_tx_limit_cents: 50000 } });
    const r = await createCardRequest(w.ctx, w.agent, notion);
    expect((await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier)).status).toBe('issued');
  });
});

describe('Slack', () => {
  it('posts pending requests to the Slack webhook with a link to approve', async () => {
    const w = await setupWorld();
    await w.store.updateOrganization(w.org.id, { slack_webhook_ciphertext: await encryptCredentials({ url: 'https://hooks.slack.com/services/T/B/X' }, w.ctx.env.CONNECTIONS_KEY) });
    const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant: 'Notion', purpose: 'abonnement' });
    const calls: { url: string; body: string }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response('ok');
    }) as unknown as typeof fetch;
    await createNotifier({ ...w.ctx, fetch: f }).requestPending(w.org.id, r.requestId);
    const slack = calls.find((c) => c.url.startsWith('https://hooks.slack.com/'));
    expect(slack).toBeTruthy();
    expect(slack!.body).toContain('49,00');
    expect(slack!.body).toContain(`http://localhost:5173/demandes/${r.requestId}`);
  });
});
