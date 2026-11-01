import { ArtemisError } from '@artemis/shared';
import { bankError, formEncode } from './http';
import type { BankConnector, BankTransaction, CardDetails, ConnectorDeps, CreateCardInput, CreatedCard } from './types';

/**
 * Stripe Issuing (UE). Références : https://docs.stripe.com/api/issuing/cards,
 * https://docs.stripe.com/api/issuing/cardholders, https://docs.stripe.com/api/issuing/transactions.
 */
export interface StripeCredentials {
  secretKey: string;
  cardholderId?: string;
  companyName?: string;
  billing?: { line1: string; city: string; postal_code: string; country: string };
}

const BASE = 'https://api.stripe.com/v1';

export class StripeIssuingConnector implements BankConnector {
  readonly provider = 'stripe' as const;
  private readonly f: typeof fetch;

  constructor(
    private creds: StripeCredentials,
    private readonly deps: ConnectorDeps = {},
  ) {
    this.f = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  private async call<T>(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.creds.secretKey}`, 'Stripe-Version': '2024-06-20' };
    let url = `${BASE}${path}`;
    let body: string | undefined;
    if (method === 'GET' && params) url += `?${formEncode(params).toString()}`;
    if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = formEncode(params ?? {}).toString();
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    }
    const res = await this.f(url, { method, headers, body });
    if (!res.ok) throw await bankError('Stripe', res);
    return (await res.json()) as T;
  }

  private async cardholder(): Promise<string> {
    if (this.creds.cardholderId) return this.creds.cardholderId;
    const b = this.creds.billing;
    if (!b) throw new ArtemisError('bank_error', 'Stripe : renseignez un titulaire (ich_…) ou l’adresse de facturation de l’entreprise.');
    const ch = await this.call<{ id: string }>('POST', '/issuing/cardholders', {
      type: 'company',
      name: (this.creds.companyName ?? 'Artemis').slice(0, 24),
      billing: { address: b },
      metadata: { created_by: 'artemis' },
    });
    this.creds = { ...this.creds, cardholderId: ch.id };
    await this.deps.onCredentialsUpdate?.(this.creds);
    return ch.id;
  }

  async testConnection() {
    try {
      await this.call('GET', '/issuing/cardholders', { limit: 1 });
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : 'erreur' };
    }
    if (!this.creds.cardholderId && !this.creds.billing) {
      return { ok: false, detail: 'Indiquez un titulaire Stripe (ich_…) ou l’adresse de facturation.' };
    }
    return { ok: true, detail: 'Stripe Issuing accessible' };
  }

  async createSingleUseCard(input: CreateCardInput): Promise<CreatedCard> {
    const card = await this.call<{ id: string; last4: string; exp_month: number; exp_year: number }>(
      'POST',
      '/issuing/cards',
      {
        cardholder: await this.cardholder(),
        currency: input.currency.toLowerCase(),
        type: 'virtual',
        status: 'active',
        spending_controls: { spending_limits: [{ amount: input.amountCents, interval: 'all_time' }] },
        metadata: { artemis_request: input.idempotencyKey, agent: input.label.slice(0, 100), merchant: input.merchant.slice(0, 100), expires_at: input.expiresAt.toISOString() },
      },
      `artemis-card-${input.idempotencyKey}`,
    );
    return { providerCardId: card.id, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year, status: 'active' };
  }

  async revealCard(providerCardId: string): Promise<CardDetails> {
    const c = await this.call<{ number?: string; cvc?: string; exp_month: number; exp_year: number; cardholder?: { name?: string } }>(
      'GET',
      `/issuing/cards/${encodeURIComponent(providerCardId)}`,
      { expand: ['number', 'cvc'] },
    );
    if (!c.number || !c.cvc) throw new ArtemisError('bank_error', 'Stripe ne renvoie pas les données de la carte (vérifiez les droits de la clé).');
    return { number: c.number, cvc: c.cvc, expMonth: c.exp_month, expYear: c.exp_year, name: c.cardholder?.name ?? '' };
  }

  async cancelCard(providerCardId: string): Promise<void> {
    await this.call('POST', `/issuing/cards/${encodeURIComponent(providerCardId)}`, { status: 'canceled', cancellation_reason: 'none' });
  }

  async listTransactions(since: Date): Promise<BankTransaction[]> {
    const out: BankTransaction[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < 20; page++) {
      const r = await this.call<{ has_more: boolean; data: Array<{ id: string; card: string | { id: string }; amount: number; currency: string; type: string; created: number; merchant_data?: { name?: string } }> }>(
        'GET',
        '/issuing/transactions',
        { limit: 100, created: { gte: Math.floor(since.getTime() / 1000) }, starting_after: startingAfter },
      );
      for (const t of r.data) {
        out.push(stripeTransaction(t));
      }
      if (!r.has_more || !r.data.length) break;
      startingAfter = r.data[r.data.length - 1]!.id;
    }
    return out;
  }
}

export function stripeTransaction(t: { id: string; card: string | { id: string }; amount: number; currency: string; type: string; created: number; merchant_data?: { name?: string; category?: string } }): BankTransaction {
  return {
    providerTxId: t.id,
    providerCardId: typeof t.card === 'string' ? t.card : t.card.id,
    amountCents: Math.abs(t.amount),
    currency: t.currency.toUpperCase(),
    merchantName: t.merchant_data?.name ?? 'Inconnu',
    status: t.type === 'refund' ? 'reversed' : 'posted',
    occurredAt: new Date(t.created * 1000),
  };
}
