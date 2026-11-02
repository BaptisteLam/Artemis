import { describe, expect, it } from 'vitest';
import { decryptCredentials, encryptCredentials, SandboxConnector, type SandboxState } from '@artemis/connectors';
import { approveRequest, createCardRequest } from './requests';
import { listSubscriptions } from './subscriptions';
import { complianceReport } from './compliance';
import { applyBankTransaction } from './reconcile';
import { fakeVerifier, setupWorld } from './testing';
import { runScheduled } from '../cron';

const sub = { amount: 1500, merchant: 'Figma', purpose: 'abonnement mensuel', recurring: { interval: 'month' } };

async function pay(w: Awaited<ReturnType<typeof setupWorld>>, requestId: string, amount: number) {
  const conn = (await w.store.getBankConnection(w.conn.id))!;
  const state = await decryptCredentials<SandboxState>(conn.credentials_ciphertext, w.ctx.env.CONNECTIONS_KEY);
  const card = (await w.store.getCardByRequest(requestId))!;
  const sbx = new SandboxConnector(state, { now: w.ctx.now, onCredentialsUpdate: async (s) => w.store.updateBankConnection(w.conn.id, { credentials_ciphertext: await encryptCredentials(s, w.ctx.env.CONNECTIONS_KEY) }) });
  const tx = await sbx.simulatePayment(card.provider_card_id, { amountCents: amount, merchantName: 'Figma' });
  return applyBankTransaction(w.ctx, (await w.store.getBankConnection(w.conn.id))!, tx);
}

describe('abonnements', () => {
  it('keeps a recurring card active across monthly payments', async () => {
    const w = await setupWorld({ plan: 'team' });
    const r = await createCardRequest(w.ctx, w.agent, sub);
    await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    const card = (await w.store.getCardByRequest(r.requestId))!;
    expect(card.recurring).toBe(true);
    expect((await pay(w, r.requestId, 1500)).match_status).toBe('matched');
    w.advance(31 * 86400_000);
    await runScheduled(w.ctx);
    expect((await pay(w, r.requestId, 1500)).match_status).toBe('matched');
    expect((await w.store.getCardByRequest(r.requestId))?.status).toBe('active');
    expect((await w.store.getCardRequest(r.requestId))?.status).toBe('issued');
    const subs = await listSubscriptions(w.ctx, w.org.id);
    expect(subs[0]).toMatchObject({ merchant: 'Figma', payments: 2, total_paid_cents: 3000, dormant: false });
  });

  it('flags a dormant subscription after 45 days without payment', async () => {
    const w = await setupWorld({ plan: 'team' });
    const r = await createCardRequest(w.ctx, w.agent, sub);
    await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    await pay(w, r.requestId, 1500);
    w.advance(46 * 86400_000);
    expect((await listSubscriptions(w.ctx, w.org.id))[0]?.dormant).toBe(true);
  });

  it('is reserved to plans with subscriptions', async () => {
    const w = await setupWorld({ plan: 'builder' });
    await expect(createCardRequest(w.ctx, w.agent, sub)).rejects.toMatchObject({ code: 'plan_limit' });
  });
});

describe('dossier AI Act', () => {
  it('summarises human oversight for the quarter', async () => {
    const w = await setupWorld({ plan: 'business', policy: { merchant_allow: ['Notion'], auto_approve_below_cents: 2000 } });
    const a = await createCardRequest(w.ctx, w.agent, { amount: 1000, merchant: 'Notion', purpose: 'x' });
    expect(a.status).toBe('approved');
    const b = await createCardRequest(w.ctx, w.agent, { amount: 5000, merchant: 'Notion', purpose: 'y' });
    await approveRequest(w.ctx, w.owner, w.org.id, b.requestId, fakeVerifier);
    await createCardRequest(w.ctx, w.agent, { amount: 5000, merchant: 'Casino', purpose: 'z' });
    const rep = await complianceReport(w.ctx, w.org.id, '2026-Q4');
    expect(rep.period).toEqual({ quarter: '2026-Q4', from: expect.any(String), to: expect.any(String) });
    expect(rep.stats).toMatchObject({ requests: 3, human_approved: 1, auto_approved: 1, rejected_by_rules: 1 });
    expect(rep.agents[0]).toMatchObject({ name: 'notion.agent', platform: 'claude' });
    expect(rep.audit.ok).toBe(true);
    expect(rep.statement).toMatch(/article 14/i);
  });
});
