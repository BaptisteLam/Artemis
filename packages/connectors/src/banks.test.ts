import { describe, expect, it } from 'vitest';
import { ArtemisError } from '@artemis/shared';
import { RevolutConnector } from './revolut';
import { QontoConnector } from './qonto';

type Call = { url: string; method: string; body: string; headers: Record<string, string> };
function mock(handler: (c: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const c = { url, method: init.method ?? 'GET', body: String(init.body ?? ''), headers: (init.headers ?? {}) as Record<string, string> };
    calls.push(c);
    const r = handler(c);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, f };
}
const input = { amountCents: 4900, currency: 'EUR', merchant: 'Notion', expiresAt: new Date('2026-11-10T10:30:00Z'), label: 'notion.agent', idempotencyKey: '7c0e6d1e-4b0b-4a7f-9a55-1d2f3b4c5d6e' };

describe('RevolutConnector', () => {
  it('creates a virtual card with a single spending limit in major units', async () => {
    const { calls, f } = mock(() => ({ body: { id: 'card_1', last_digits: '1234', expiry: '11/2029', state: 'active' } }));
    const c = new RevolutConnector({ accessToken: 'tok', environment: 'sandbox' }, { fetch: f });
    const card = await c.createSingleUseCard(input);
    expect(card).toEqual({ providerCardId: 'card_1', last4: '1234', expMonth: 11, expYear: 2029, status: 'active' });
    expect(calls[0]!.url).toBe('https://sandbox-b2b.revolut.com/api/1.0/cards');
    const body = JSON.parse(calls[0]!.body);
    expect(body.virtual).toBe(true);
    expect(body.request_id.length).toBeLessThanOrEqual(40);
    expect(body.spending_limits.single).toEqual({ amount: 49, currency: 'EUR' });
  });
  it('reveals sensitive details', async () => {
    const { f } = mock(() => ({ body: { pan: '5555444433331111', cvv: '987', expiry: '11/2029', cardholder_name: 'STUDIO LUMEN' } }));
    const d = await new RevolutConnector({ accessToken: 'tok', environment: 'production' }, { fetch: f }).revealCard('card_1');
    expect(d).toEqual({ number: '5555444433331111', cvc: '987', expMonth: 11, expYear: 2029, name: 'STUDIO LUMEN' });
  });
  it('refreshes an expired token once', async () => {
    let n = 0;
    let saved: unknown;
    const { calls, f } = mock((c) => {
      if (c.url.endsWith('/auth/token')) return { body: { access_token: 'new', refresh_token: 'r2' } };
      n++;
      return n === 1 ? { status: 401, body: { message: 'expired' } } : { body: { id: 'card_2', last_digits: '0001', expiry: '01/2030' } };
    });
    const c = new RevolutConnector({ accessToken: 'old', refreshToken: 'r1', clientAssertion: 'jwt', environment: 'production' }, { fetch: f, onCredentialsUpdate: async (x) => void (saved = x) });
    await c.createSingleUseCard(input);
    expect(calls.map((x) => x.url.split('/').pop())).toEqual(['cards', 'token', 'cards']);
    expect(calls[2]!.headers.Authorization).toBe('Bearer new');
    expect(saved).toMatchObject({ accessToken: 'new', refreshToken: 'r2' });
  });
  it('maps card payments to transactions', async () => {
    const { f } = mock(() => ({ body: [
      { id: 'tx1', type: 'card_payment', state: 'completed', created_at: '2026-11-10T10:00:00Z', merchant: { name: 'Notion', category_code: '5734' }, card: { id: 'card_1' }, legs: [{ amount: -49, currency: 'EUR' }] },
      { id: 'tx2', type: 'transfer', state: 'completed', created_at: '2026-11-10T10:00:00Z', legs: [{ amount: -10, currency: 'EUR' }] },
    ] }));
    const txs = await new RevolutConnector({ accessToken: 'tok', environment: 'production' }, { fetch: f }).listTransactions(new Date(0));
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ providerTxId: 'tx1', providerCardId: 'card_1', amountCents: 4900, merchantName: 'Notion', mcc: '5734', status: 'posted' });
  });
  it('maps errors to bank_error', async () => {
    const { f } = mock(() => ({ status: 403, body: { code: 'forbidden', message: 'nope' } }));
    const err = await new RevolutConnector({ accessToken: 'tok', environment: 'production' }, { fetch: f }).createSingleUseCard(input).catch((e) => e);
    expect(err).toBeInstanceOf(ArtemisError);
    expect(err.code).toBe('bank_error');
  });
});

describe('QontoConnector', () => {
  it('creates a virtual card with the exact monthly limit and an idempotency key', async () => {
    const { calls, f } = mock(() => ({ body: { card: { id: 'qc_1', last_digits: '9876', expiration_date: '2029-11-30', status: 'live' } } }));
    const c = new QontoConnector({ accessToken: 'tok', environment: 'production', holderId: 'm1', bankAccountId: 'ba1' }, { fetch: f });
    const card = await c.createSingleUseCard(input);
    expect(card).toMatchObject({ providerCardId: 'qc_1', last4: '9876', expMonth: 11, expYear: 2029, status: 'active' });
    expect(calls[0]!.url).toBe('https://thirdparty.qonto.com/v2/cards');
    expect(calls[0]!.headers['X-Qonto-Idempotency-Key']).toBe(input.idempotencyKey);
    const body = JSON.parse(calls[0]!.body).card;
    expect(body.card_level).toBe('virtual');
    expect(body.payment_monthly_limit).toBe('49.00');
  });
  it('returns pending_bank_sca when Qonto requires strong authentication', async () => {
    const { f } = mock(() => ({ status: 428, body: { errors: [{ code: 'sca_required' }], sca_session_token: 'sca1' } }));
    const card = await new QontoConnector({ accessToken: 'tok', environment: 'production', holderId: 'm1', bankAccountId: 'ba1' }, { fetch: f }).createSingleUseCard(input);
    expect(card.status).toBe('pending_bank_sca');
  });
  it('cannot hand the card number to an agent', async () => {
    const { f } = mock(() => ({ body: {} }));
    const err = await new QontoConnector({ accessToken: 'tok', environment: 'production', holderId: 'm1', bankAccountId: 'ba1' }, { fetch: f }).revealCard('qc_1').catch((e) => e);
    expect(err).toBeInstanceOf(ArtemisError);
    expect(err.message).toMatch(/affichage sécurisé/);
  });
  it('gives a secure view URL for humans', async () => {
    const { calls, f } = mock(() => ({ body: { iframe_url: 'https://qonto.example/view/abc' } }));
    const url = await new QontoConnector({ accessToken: 'tok', environment: 'production', holderId: 'm1', bankAccountId: 'ba1' }, { fetch: f }).secureViewUrl('qc_1');
    expect(url).toBe('https://qonto.example/view/abc');
    expect(calls[0]!.url).toBe('https://thirdparty.qonto.com/v2/cards/qc_1/data_view');
  });
});
