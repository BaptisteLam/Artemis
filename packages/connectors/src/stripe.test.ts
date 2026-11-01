import { describe, expect, it } from 'vitest';
import { ArtemisError } from '@artemis/shared';
import { StripeIssuingConnector } from './stripe';

type Call = { url: string; method: string; body: string; headers: Record<string, string> };

function mock(responses: Record<string, { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: String(init.body ?? ''), headers: init.headers as Record<string, string> });
    const key = Object.keys(responses).find((k) => `${init.method ?? 'GET'} ${url}`.startsWith(k));
    const r = key ? responses[key]! : { status: 404, body: { error: { message: 'nope' } } };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, f };
}

const input = { amountCents: 4900, currency: 'EUR', merchant: 'Notion', expiresAt: new Date('2026-11-10T10:30:00Z'), label: 'notion.agent', idempotencyKey: 'req-1' };

describe('StripeIssuingConnector', () => {
  it('creates a virtual card limited to the exact amount', async () => {
    const { calls, f } = mock({ 'POST https://api.stripe.com/v1/issuing/cards': { body: { id: 'ic_1', last4: '4242', exp_month: 12, exp_year: 2029, status: 'active' } } });
    const c = new StripeIssuingConnector({ secretKey: 'sk_test_x', cardholderId: 'ich_1' }, { fetch: f });
    const card = await c.createSingleUseCard(input);
    expect(card).toEqual({ providerCardId: 'ic_1', last4: '4242', expMonth: 12, expYear: 2029, status: 'active' });
    const body = new URLSearchParams(calls[0]!.body);
    expect(body.get('currency')).toBe('eur');
    expect(body.get('type')).toBe('virtual');
    expect(body.get('cardholder')).toBe('ich_1');
    expect(body.get('spending_controls[spending_limits][0][amount]')).toBe('4900');
    expect(body.get('spending_controls[spending_limits][0][interval]')).toBe('all_time');
    expect(calls[0]!.headers['Idempotency-Key']).toBe('artemis-card-req-1');
    expect(calls[0]!.headers.Authorization).toBe('Bearer sk_test_x');
  });

  it('creates the company cardholder on first use and persists it', async () => {
    let saved: unknown;
    const { calls, f } = mock({
      'POST https://api.stripe.com/v1/issuing/cardholders': { body: { id: 'ich_new' } },
      'POST https://api.stripe.com/v1/issuing/cards': { body: { id: 'ic_2', last4: '0005', exp_month: 1, exp_year: 2030 } },
    });
    const creds = { secretKey: 'sk_test_x', companyName: 'Studio Lumen', billing: { line1: '1 rue de Rivoli', city: 'Paris', postal_code: '75001', country: 'FR' } };
    const c = new StripeIssuingConnector(creds, { fetch: f, onCredentialsUpdate: async (x) => void (saved = x) });
    await c.createSingleUseCard(input);
    expect(new URLSearchParams(calls[0]!.body).get('type')).toBe('company');
    expect(new URLSearchParams(calls[1]!.body).get('cardholder')).toBe('ich_new');
    expect(saved).toMatchObject({ cardholderId: 'ich_new' });
  });

  it('maps Stripe errors to bank_error without leaking the raw body', async () => {
    const { f } = mock({ 'POST https://api.stripe.com/v1/issuing/cards': { status: 402, body: { error: { code: 'insufficient_funds', message: 'secret details sk_live_xyz' } } } });
    const c = new StripeIssuingConnector({ secretKey: 'sk_test_x', cardholderId: 'ich_1' }, { fetch: f });
    const err = await c.createSingleUseCard(input).catch((e) => e);
    expect(err).toBeInstanceOf(ArtemisError);
    expect(err.code).toBe('bank_error');
    expect(err.message).toContain('insufficient_funds');
    expect(err.message).not.toContain('sk_live_xyz');
  });

  it('reveals number and cvc through expand', async () => {
    const { calls, f } = mock({ 'GET https://api.stripe.com/v1/issuing/cards/ic_1': { body: { id: 'ic_1', number: '4000009990000001', cvc: '123', exp_month: 12, exp_year: 2029, cardholder: { name: 'Studio Lumen' } } } });
    const d = await new StripeIssuingConnector({ secretKey: 'sk', cardholderId: 'ich_1' }, { fetch: f }).revealCard('ic_1');
    expect(d).toEqual({ number: '4000009990000001', cvc: '123', expMonth: 12, expYear: 2029, name: 'Studio Lumen' });
    expect(calls[0]!.url).toContain('expand%5B%5D=number');
    expect(calls[0]!.url).toContain('expand%5B%5D=cvc');
  });

  it('maps issuing transactions to positive cents', async () => {
    const { f } = mock({
      'GET https://api.stripe.com/v1/issuing/transactions': {
        body: { has_more: false, data: [
          { id: 'ipi_1', card: 'ic_1', amount: -4900, currency: 'eur', type: 'capture', created: 1793000000, merchant_data: { name: 'NOTION LABS' } },
          { id: 'ipi_2', card: 'ic_1', amount: 4900, currency: 'eur', type: 'refund', created: 1793000100, merchant_data: { name: 'NOTION LABS' } },
        ] },
      },
    });
    const txs = await new StripeIssuingConnector({ secretKey: 'sk', cardholderId: 'ich_1' }, { fetch: f }).listTransactions(new Date(0));
    expect(txs[0]).toMatchObject({ providerTxId: 'ipi_1', providerCardId: 'ic_1', amountCents: 4900, currency: 'EUR', merchantName: 'NOTION LABS', status: 'posted' });
    expect(txs[1]!.status).toBe('reversed');
  });

  it('cancels a card', async () => {
    const { calls, f } = mock({ 'POST https://api.stripe.com/v1/issuing/cards/ic_1': { body: { id: 'ic_1', status: 'canceled' } } });
    await new StripeIssuingConnector({ secretKey: 'sk', cardholderId: 'ich_1' }, { fetch: f }).cancelCard('ic_1');
    expect(new URLSearchParams(calls[0]!.body).get('status')).toBe('canceled');
  });

  it('testConnection needs a cardholder or a billing address', async () => {
    const { f } = mock({ 'GET https://api.stripe.com/v1/issuing/cardholders': { body: { data: [] } } });
    expect((await new StripeIssuingConnector({ secretKey: 'sk' }, { fetch: f }).testConnection()).ok).toBe(false);
    expect((await new StripeIssuingConnector({ secretKey: 'sk', cardholderId: 'ich_1' }, { fetch: f }).testConnection()).ok).toBe(true);
  });
});
