import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { approveRequest } from '../services/requests';
import { fakeVerifier, setupWorld } from '../services/testing';

let w: Awaited<ReturnType<typeof setupWorld>>;
beforeEach(async () => void (w = await setupWorld()));

const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  createApp({ store: w.store, now: w.ctx.now }).request(path, {
    method,
    headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, w.ctx.env);
const json = async (r: Response) => (await r.json()) as any;

describe('REST v1', () => {
  it('creates a request', async () => {
    const res = await call('POST', '/v1/card-requests', { amount: 4900, merchant: 'Notion', purpose: 'abonnement équipe' });
    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({ status: 'pending_approval', request_id: expect.any(String) });
  });
  it('rejects a decimal amount with invalid_amount', async () => {
    const res = await call('POST', '/v1/card-requests', { amount: 49.9, merchant: 'Notion', purpose: 'x' });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('invalid_amount');
  });
  it('full cycle: status, reveal once, budgets, summary', async () => {
    const created = await json(await call('POST', '/v1/card-requests', { amount: 4900, merchant: 'Notion', purpose: 'x' }));
    const early = await call('POST', `/v1/card-requests/${created.request_id}/reveal`);
    expect(early.status).toBe(409);
    expect((await json(early)).error.code).toBe('card_not_ready');
    await approveRequest(w.ctx, w.owner, w.org.id, created.request_id, fakeVerifier);
    const status = await json(await call('GET', `/v1/card-requests/${created.request_id}`));
    expect(status.status).toBe('issued');
    expect(status.card.last4).toMatch(/^\d{4}$/);
    const reveal = await call('POST', `/v1/card-requests/${created.request_id}/reveal`);
    expect(reveal.status).toBe(200);
    expect((await json(reveal)).number).toMatch(/^\d{16}$/);
    expect((await call('POST', `/v1/card-requests/${created.request_id}/reveal`)).status).toBe(409);
    const budgets = await json(await call('GET', '/v1/budgets'));
    expect(budgets).toMatchObject({ monthly_budget: 50000, spent: 4900, remaining: 45100, per_transaction_limit: 10000, currency: 'EUR' });
    const summary = await json(await call('GET', '/v1/spend-summary?period=month'));
    expect(summary.by_merchant[0]).toMatchObject({ merchant: 'Notion', amount: 4900, count: 1 });
  });
  it('attaches a base64 receipt', async () => {
    const created = await json(await call('POST', '/v1/card-requests', { amount: 4900, merchant: 'Notion', purpose: 'x' }));
    const res = await call('POST', `/v1/card-requests/${created.request_id}/receipts`, {
      filename: 'facture.pdf',
      content_base64: btoa('%PDF-1.4 test'),
    });
    expect(res.status).toBe(201);
    expect((await json(res)).receipt_id).toEqual(expect.any(String));
  });
  it('waitlist is idempotent', async () => {
    const r1 = await call('POST', '/v1/waitlist', { email: 'Lea@Exemple.fr', company: 'X' }, { Authorization: '' });
    const r2 = await call('POST', '/v1/waitlist', { email: 'lea@exemple.fr' }, { Authorization: '' });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(await w.store.countWaitlist()).toBe(1);
  });
  it('waitlist rejects an invalid email', async () => {
    expect((await call('POST', '/v1/waitlist', { email: 'nope' }, { Authorization: '' })).status).toBe(400);
  });
});
