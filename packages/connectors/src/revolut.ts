import { ArtemisError } from '@artemis/shared';
import { bankError } from './http';
import type { BankConnector, BankTransaction, CardDetails, ConnectorDeps, CreateCardInput, CreatedCard } from './types';

/**
 * Revolut Business API. Références (à revérifier avant la mise en production, le domaine de doc étant
 * inaccessible depuis l'environnement de build) :
 * - POST /cards (virtuel uniquement, request_id ≤ 40 caractères, spending_limits.single)
 * - GET /cards/{id}/sensitive-details (scope READ_SENSITIVE_CARD_DATA)
 * - DELETE /cards/{id} (résiliation), GET /transactions
 * https://developer.revolut.com/docs/api/business
 */
export interface RevolutCredentials {
  accessToken: string;
  refreshToken?: string;
  /** JWT client_assertion signé par l'application (flux OAuth Revolut Business). */
  clientAssertion?: string;
  environment: 'sandbox' | 'production';
  holderId?: string;
}

const BASES = { production: 'https://b2b.revolut.com/api/1.0', sandbox: 'https://sandbox-b2b.revolut.com/api/1.0' } as const;

function parseExpiry(expiry: string | undefined): { m: number; y: number } {
  const m = /^(\d{1,2})\/(\d{2,4})$/.exec(expiry ?? '');
  if (!m) return { m: 0, y: 0 };
  const y = Number(m[2]);
  return { m: Number(m[1]), y: y < 100 ? 2000 + y : y };
}

export class RevolutConnector implements BankConnector {
  readonly provider = 'revolut' as const;
  private readonly f: typeof fetch;

  constructor(
    private creds: RevolutCredentials,
    private readonly deps: ConnectorDeps = {},
  ) {
    this.f = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  private get base() {
    return BASES[this.creds.environment] ?? BASES.production;
  }

  private async refresh(): Promise<boolean> {
    if (!this.creds.refreshToken || !this.creds.clientAssertion) return false;
    const res = await this.f(`${this.base}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.creds.refreshToken,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: this.creds.clientAssertion,
      }).toString(),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { access_token: string; refresh_token?: string };
    this.creds = { ...this.creds, accessToken: j.access_token, refreshToken: j.refresh_token ?? this.creds.refreshToken };
    await this.deps.onCredentialsUpdate?.(this.creds);
    return true;
  }

  private async call<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const res = await this.f(`${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.creds.accessToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && !retried && (await this.refresh())) return this.call<T>(method, path, body, true);
    if (!res.ok) throw await bankError('Revolut', res);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async testConnection() {
    try {
      await this.call('GET', '/accounts');
      return { ok: true, detail: 'Revolut Business accessible' };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : 'erreur' };
    }
  }

  async createSingleUseCard(input: CreateCardInput): Promise<CreatedCard> {
    const c = await this.call<{ id: string; last_digits: string; expiry?: string }>('POST', '/cards', {
      request_id: input.idempotencyKey.replace(/-/g, '').slice(0, 40),
      virtual: true,
      holder_id: this.creds.holderId,
      label: `${input.label} · ${input.merchant}`.slice(0, 30),
      spending_limits: input.recurring === 'month'
        ? { month: { amount: input.amountCents / 100, currency: input.currency } }
        : { single: { amount: input.amountCents / 100, currency: input.currency } },
    });
    const exp = parseExpiry(c.expiry);
    return { providerCardId: c.id, last4: c.last_digits, expMonth: exp.m, expYear: exp.y, status: 'active' };
  }

  async revealCard(providerCardId: string): Promise<CardDetails> {
    const d = await this.call<{ pan: string; cvv: string; expiry: string; cardholder_name?: string }>('GET', `/cards/${encodeURIComponent(providerCardId)}/sensitive-details`);
    if (!d?.pan) throw new ArtemisError('bank_error', 'Revolut ne renvoie pas les données de la carte (scope READ_SENSITIVE_CARD_DATA requis).');
    const exp = parseExpiry(d.expiry);
    return { number: d.pan, cvc: d.cvv, expMonth: exp.m, expYear: exp.y, name: d.cardholder_name ?? '' };
  }

  async cancelCard(providerCardId: string): Promise<void> {
    await this.call('DELETE', `/cards/${encodeURIComponent(providerCardId)}`);
  }

  async listTransactions(since: Date): Promise<BankTransaction[]> {
    const rows = await this.call<
      Array<{ id: string; type: string; state: string; created_at: string; merchant?: { name?: string; category_code?: string }; card?: { id?: string }; legs?: { amount: number; currency: string }[] }>
    >('GET', `/transactions?from=${encodeURIComponent(since.toISOString())}&type=card_payment&count=1000`);
    return rows
      .filter((t) => t.type === 'card_payment' && t.card?.id)
      .map((t) => {
        const leg = t.legs?.[0];
        return {
          providerTxId: t.id,
          providerCardId: t.card!.id!,
          amountCents: Math.round(Math.abs(leg?.amount ?? 0) * 100),
          currency: (leg?.currency ?? 'EUR').toUpperCase(),
          merchantName: t.merchant?.name ?? 'Inconnu',
          mcc: t.merchant?.category_code,
          status: t.state === 'completed' ? 'posted' : t.state === 'pending' ? 'pending' : t.state === 'reverted' ? 'reversed' : 'declined',
          occurredAt: new Date(t.created_at),
        } satisfies BankTransaction;
      });
  }
}
