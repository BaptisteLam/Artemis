import { describe, expect, it } from 'vitest';
import { createCardRequest, approveRequest } from './requests';
import { fakeVerifier, setupWorld } from './testing';
import { runScheduled } from '../cron';
import { applyBankTransaction } from './reconcile';

const notion = { amount: 1000, merchant: 'Notion', purpose: 'x' };

describe('garde-fous (API)', () => {
  it('refuses beyond the hourly velocity limit', async () => {
    const w = await setupWorld({ policy: { max_requests_per_hour: 2 } });
    expect((await createCardRequest(w.ctx, w.agent, notion)).status).toBe('pending_approval');
    expect((await createCardRequest(w.ctx, w.agent, notion)).status).toBe('pending_approval');
    const third = await createCardRequest(w.ctx, w.agent, notion);
    expect(third.status).toBe('rejected');
    expect(third.reason).toMatch(/too_many_requests/);
  });

  it('flags an unusual amount and forces human approval', async () => {
    const w = await setupWorld({ policy: { merchant_allow: ['Notion'], auto_approve_below_cents: 9000 } });
    for (let i = 0; i < 5; i++) expect((await createCardRequest(w.ctx, w.agent, notion)).status).toBe('approved');
    const big = await createCardRequest(w.ctx, w.agent, { ...notion, amount: 8000 });
    expect(big.status).toBe('pending_approval');
    expect((await w.store.getCardRequest(big.requestId))?.decision_reason).toMatch(/unusual_amount/);
  });

  it('freezes an agent whose purchase still has no receipt after the deadline', async () => {
    const w = await setupWorld({ policy: { require_receipt_hours: 24 } });
    const r = await createCardRequest(w.ctx, w.agent, notion);
    await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    const card = (await w.store.getCardByRequest(r.requestId))!;
    await applyBankTransaction(w.ctx, (await w.store.getBankConnection(w.conn.id))!, { providerTxId: 't1', providerCardId: card.provider_card_id, amountCents: 1000, currency: 'EUR', merchantName: 'Notion', status: 'posted', occurredAt: w.ctx.now() });
    expect((await w.store.getCardRequest(r.requestId))?.status).toBe('completed');
    w.advance(23 * 3600_000);
    await runScheduled(w.ctx);
    expect((await w.store.getAgent(w.agent.id))?.status).toBe('active');
    w.advance(2 * 3600_000);
    await runScheduled(w.ctx);
    expect((await w.store.getAgent(w.agent.id))?.status).toBe('frozen');
    const actions = (await w.store.listAllAudit(w.org.id)).map((a) => a.action);
    expect(actions).toContain('agent.frozen');
  });

  it('does not freeze when the receipt is attached in time', async () => {
    const w = await setupWorld({ policy: { require_receipt_hours: 24 } });
    const r = await createCardRequest(w.ctx, w.agent, notion);
    await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    const card = (await w.store.getCardByRequest(r.requestId))!;
    await applyBankTransaction(w.ctx, (await w.store.getBankConnection(w.conn.id))!, { providerTxId: 't1', providerCardId: card.provider_card_id, amountCents: 1000, currency: 'EUR', merchantName: 'Notion', status: 'posted', occurredAt: w.ctx.now() });
    await w.store.createReceipt({ org_id: w.org.id, request_id: r.requestId, storage_path: 'x', filename: 'f.pdf', content_type: 'application/pdf', size_bytes: 10, uploaded_by: 'agent' });
    w.advance(30 * 3600_000);
    await runScheduled(w.ctx);
    expect((await w.store.getAgent(w.agent.id))?.status).toBe('active');
  });
});
