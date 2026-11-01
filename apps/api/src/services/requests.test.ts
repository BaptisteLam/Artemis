import { describe, expect, it } from 'vitest';
import { ArtemisError } from '@artemis/shared';
import { approveRequest, cancelCard, createCardRequest, freezeOrganization, rejectRequest, revealCardForCheckout } from './requests';
import { verifyAuditChain } from './audit';
import { fakeVerifier, setupWorld } from './testing';

const notion = { amount: 4900, currency: 'EUR', merchant: 'Notion', purpose: 'abonnement équipe' };

describe('card request flow', () => {
  it('runs request → approval → issued card → single reveal', async () => {
    const w = await setupWorld();
    const r = await createCardRequest(w.ctx, w.agent, notion);
    expect(r.status).toBe('pending_approval');
    await w.flush();
    expect(w.calls).toContain(`pending:${r.requestId}`);
    await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    expect((await w.store.getCardRequest(r.requestId))?.status).toBe('issued');
    const mandate = await w.store.getMandate(r.requestId);
    expect(mandate?.signature).toBe(`sig:${mandate?.payload_hash}`);
    const card = await revealCardForCheckout(w.ctx, w.agent, r.requestId);
    expect(card.number).toMatch(/^\d{16}$/);
    expect(card.cvc).toMatch(/^\d{3}$/);
    await expect(revealCardForCheckout(w.ctx, w.agent, r.requestId)).rejects.toMatchObject({ code: 'already_revealed' });
  });

  it('budget is enforced atomically under concurrency', async () => {
    const w = await setupWorld({ policy: { monthly_budget_cents: 5000 } });
    const res = await Promise.all([
      createCardRequest(w.ctx, w.agent, { ...notion, amount: 3000 }),
      createCardRequest(w.ctx, w.agent, { ...notion, amount: 3000 }),
    ]);
    const statuses = res.map((r) => r.status).sort();
    expect(statuses).toEqual(['pending_approval', 'rejected']);
    expect(res.find((r) => r.status === 'rejected')?.reason).toMatch(/over_monthly_budget/);
  });

  it('reveals card details exactly once under concurrency', async () => {
    const w = await setupWorld();
    const r = await createCardRequest(w.ctx, w.agent, notion);
    await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    const out = await Promise.allSettled([
      revealCardForCheckout(w.ctx, w.agent, r.requestId),
      revealCardForCheckout(w.ctx, w.agent, r.requestId),
    ]);
    expect(out.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rej = out.find((o) => o.status === 'rejected') as PromiseRejectedResult;
    expect(rej.reason.code).toBe('already_revealed');
  });

  it('refuses approval when not pending or not approver', async () => {
    const w = await setupWorld();
    const a = await createCardRequest(w.ctx, w.agent, notion);
    await expect(approveRequest(w.ctx, w.viewer, w.org.id, a.requestId, fakeVerifier)).rejects.toMatchObject({ code: 'forbidden' });
    await rejectRequest(w.ctx, w.owner, w.org.id, a.requestId, 'pas maintenant');
    await expect(approveRequest(w.ctx, w.owner, w.org.id, a.requestId, fakeVerifier)).rejects.toMatchObject({ code: 'request_not_pending' });
    const b = await createCardRequest(w.ctx, w.agent, notion);
    w.advance(31 * 60_000);
    await expect(approveRequest(w.ctx, w.owner, w.org.id, b.requestId, fakeVerifier)).rejects.toMatchObject({ code: 'request_expired' });
    expect((await w.store.getCardRequest(b.requestId))?.status).toBe('expired');
  });

  it('auto approves an allow-listed merchant under the threshold without notifying', async () => {
    const w = await setupWorld({ policy: { merchant_allow: ['Notion'], auto_approve_below_cents: 5000 } });
    const r = await createCardRequest(w.ctx, w.agent, notion);
    expect(r.status).toBe('approved');
    await w.flush();
    expect(w.calls).toHaveLength(0);
    expect((await w.store.getCardRequest(r.requestId))?.status).toBe('issued');
    expect((await w.store.getMandate(r.requestId))?.auto_approved).toBe(true);
  });

  it('rejects by policy with a reason and stores the request', async () => {
    const w = await setupWorld();
    const r = await createCardRequest(w.ctx, w.agent, { ...notion, amount: 20000 });
    expect(r.status).toBe('rejected');
    expect(r.reason).toMatch(/over_transaction_limit/);
    expect((await w.store.getCardRequest(r.requestId))?.status).toBe('rejected');
  });

  it('enforces the monthly quota', async () => {
    const w = await setupWorld({ plan: 'sandbox' });
    for (let i = 0; i < 50; i++) await w.store.incrementUsage(w.org.id, '2026-11');
    await expect(createCardRequest(w.ctx, w.agent, notion)).rejects.toMatchObject({ code: 'quota_exceeded' });
  });

  it('marks the request failed when the bank errors', async () => {
    const w = await setupWorld();
    await w.store.updateBankConnection(w.conn.id, { credentials_ciphertext: 'v1.broken.data' });
    const r = await createCardRequest(w.ctx, w.agent, notion);
    await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    expect((await w.store.getCardRequest(r.requestId))?.status).toBe('failed');
    const audit = await w.store.listAllAudit(w.org.id);
    expect(audit.map((a) => a.action)).toContain('card.issue_failed');
  });

  it('never writes card numbers to the audit log', async () => {
    const w = await setupWorld();
    const r = await createCardRequest(w.ctx, w.agent, notion);
    await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    const card = await revealCardForCheckout(w.ctx, w.agent, r.requestId);
    const dump = JSON.stringify(await w.store.listAllAudit(w.org.id));
    expect(dump).not.toContain(card.number);
    expect(dump).not.toContain(card.number.slice(0, 8));
  });

  it('cancels an issued card and freezes the organisation', async () => {
    const w = await setupWorld();
    const r = await createCardRequest(w.ctx, w.agent, notion);
    await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    await cancelCard(w.ctx, { type: 'agent', id: w.agent.id }, w.org.id, r.requestId);
    expect((await w.store.getCardByRequest(r.requestId))?.status).toBe('canceled');
    const r2 = await createCardRequest(w.ctx, w.agent, notion);
    await approveRequest(w.ctx, w.owner, w.org.id, r2.requestId, fakeVerifier);
    await freezeOrganization(w.ctx, w.owner, w.org.id);
    expect((await w.store.getCardByRequest(r2.requestId))?.status).toBe('canceled');
    expect((await w.store.getAgent(w.agent.id))?.status).toBe('frozen');
    expect((await w.store.getOrganization(w.org.id))?.frozen_at).not.toBeNull();
  });

  it('verifyAuditChain detects tampering', async () => {
    const w = await setupWorld();
    await createCardRequest(w.ctx, w.agent, notion);
    await createCardRequest(w.ctx, w.agent, notion);
    const entries = await w.store.listAllAudit(w.org.id);
    expect((await verifyAuditChain(entries)).ok).toBe(true);
    entries[0]!.data = { ...entries[0]!.data, amount_cents: 1 };
    const v = await verifyAuditChain(entries);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(entries[0]!.id);
  });

  it('rejects requests from another organisation', async () => {
    const w = await setupWorld();
    const other = await setupWorld();
    const r = await createCardRequest(other.ctx, other.agent, notion);
    await expect(revealCardForCheckout(w.ctx, w.agent, r.requestId)).rejects.toBeInstanceOf(ArtemisError);
  });

  it('a bank failure during reveal does not consume the single reveal', async () => {
    const w = await setupWorld();
    const r = await createCardRequest(w.ctx, w.agent, notion);
    await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
    const { decryptCredentials, encryptCredentials } = await import('@artemis/connectors');
    const key = w.ctx.env.CONNECTIONS_KEY;
    const good = (await w.store.getBankConnection(w.conn.id))!.credentials_ciphertext;
    const state = await decryptCredentials<{ cards: Record<string, unknown> }>(good, key);
    state.cards = {};
    await w.store.updateBankConnection(w.conn.id, { credentials_ciphertext: await encryptCredentials(state, key) });
    await expect(revealCardForCheckout(w.ctx, w.agent, r.requestId)).rejects.toBeTruthy();
    expect((await w.store.getCardByRequest(r.requestId))?.revealed_at).toBeNull();
    await w.store.updateBankConnection(w.conn.id, { credentials_ciphertext: good });
    expect((await revealCardForCheckout(w.ctx, w.agent, r.requestId)).number).toMatch(/^\d{16}$/);
  });
});
