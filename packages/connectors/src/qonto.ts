import { ArtemisError } from '@artemis/shared';
import { bankError } from './http';
import type { BankConnector, BankTransaction, CardDetails, ConnectorDeps, CreateCardInput, CreatedCard } from './types';

/**
 * Qonto Business API (OAuth, programme partenaires). Références à revérifier avant production :
 * - POST /v2/cards (scope card.write, SCA requise, en-tête d'idempotence)
 * - PUT /v2/cards/{id}/discard, GET /v2/cards/{id}/data_view (iframe d'affichage sécurisé)
 * - GET /v2/transactions
 * https://docs.qonto.com/home/use-cases/cardmanagement
 * Qonto n'expose pas le numéro de carte par API : seul un humain peut l'afficher via l'iframe sécurisée.
 */
export interface QontoCredentials {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  stagingToken?: string;
  environment: 'sandbox' | 'production';
  holderId?: string;
  bankAccountId?: string;
}

const BASES = { production: 'https://thirdparty.qonto.com', sandbox: 'https://thirdparty-sandbox.staging.qonto.co' } as const;
const OAUTH = { production: 'https://oauth.qonto.com/oauth2/token', sandbox: 'https://oauth-sandbox.staging.qonto.co/oauth2/token' } as const;

export class QontoConnector implements BankConnector {
  readonly provider = 'qonto' as const;
  private readonly f: typeof fetch;

  constructor(
    private creds: QontoCredentials,
    private readonly deps: ConnectorDeps = {},
  ) {
    this.f = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  private get env() {
    return this.creds.environment === 'sandbox' ? 'sandbox' : 'production';
  }

  private headers(extra: Record<string, string> = {}) {
    const h: Record<string, string> = { Authorization: `Bearer ${this.creds.accessToken}`, 'Content-Type': 'application/json', ...extra };
    if (this.env === 'sandbox' && this.creds.stagingToken) h['X-Qonto-Staging-Token'] = this.creds.stagingToken;
    return h;
  }

  private async refresh(): Promise<boolean> {
    if (!this.creds.refreshToken || !this.creds.clientId || !this.creds.clientSecret) return false;
    const res = await this.f(OAUTH[this.env], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.creds.refreshToken, client_id: this.creds.clientId, client_secret: this.creds.clientSecret }).toString(),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { access_token: string; refresh_token?: string };
    this.creds = { ...this.creds, accessToken: j.access_token, refreshToken: j.refresh_token ?? this.creds.refreshToken };
    await this.deps.onCredentialsUpdate?.(this.creds);
    return true;
  }

  private async raw(method: string, path: string, body?: unknown, extra: Record<string, string> = {}, retried = false): Promise<Response> {
    const res = await this.f(`${BASES[this.env]}${path}`, { method, headers: this.headers(extra), body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 401 && !retried && (await this.refresh())) return this.raw(method, path, body, extra, true);
    return res;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.raw(method, path, body);
    if (!res.ok) throw await bankError('Qonto', res);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async testConnection() {
    try {
      await this.call('GET', '/v2/organization');
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : 'erreur' };
    }
    if (!this.creds.holderId || !this.creds.bankAccountId) return { ok: false, detail: 'Indiquez le titulaire (membre) et le compte bancaire Qonto.' };
    return { ok: true, detail: 'Qonto accessible' };
  }

  async createSingleUseCard(input: CreateCardInput): Promise<CreatedCard> {
    const res = await this.raw(
      'POST',
      '/v2/cards',
      {
        card: {
          holder_id: this.creds.holderId,
          bank_account_id: this.creds.bankAccountId,
          card_level: 'virtual',
          payment_monthly_limit: (input.amountCents / 100).toFixed(2),
          nickname: `${input.label} · ${input.merchant}`.slice(0, 40),
        },
      },
      { 'X-Qonto-Idempotency-Key': input.idempotencyKey },
    );
    if (res.status === 428 || res.status === 412) {
      return { providerCardId: `pending:${input.idempotencyKey}`, last4: '0000', expMonth: 0, expYear: 0, status: 'pending_bank_sca' };
    }
    if (!res.ok) throw await bankError('Qonto', res);
    const j = (await res.json()) as { card: { id: string; last_digits?: string; expiration_date?: string } };
    const exp = j.card.expiration_date ? new Date(j.card.expiration_date) : null;
    return {
      providerCardId: j.card.id,
      last4: (j.card.last_digits ?? '0000').slice(-4),
      expMonth: exp ? exp.getUTCMonth() + 1 : 0,
      expYear: exp ? exp.getUTCFullYear() : 0,
      status: 'active',
    };
  }

  async revealCard(_providerCardId: string): Promise<CardDetails> {
    throw new ArtemisError(
      'bank_error',
      "Qonto ne transmet pas le numéro de carte par API : l'approbateur l'affiche via l'affichage sécurisé Qonto dans Artemis et finalise le paiement.",
    );
  }

  /** URL de l'iframe sécurisée Qonto affichant la carte à un humain. */
  async secureViewUrl(providerCardId: string): Promise<string> {
    const j = await this.call<{ iframe_url?: string; url?: string }>('GET', `/v2/cards/${encodeURIComponent(providerCardId)}/data_view`);
    const url = j.iframe_url ?? j.url;
    if (!url) throw new ArtemisError('bank_error', 'Qonto n’a pas fourni d’affichage sécurisé.');
    return url;
  }

  async cancelCard(providerCardId: string): Promise<void> {
    if (providerCardId.startsWith('pending:')) return;
    await this.call('PUT', `/v2/cards/${encodeURIComponent(providerCardId)}/discard`);
  }

  async listTransactions(since: Date): Promise<BankTransaction[]> {
    const j = await this.call<{
      transactions: Array<{ transaction_id?: string; id?: string; card_last_digits?: string; card_id?: string; amount: number; currency: string; label: string; side: string; status: string; settled_at?: string; emitted_at: string; operation_type: string }>;
    }>('GET', `/v2/transactions?bank_account_id=${encodeURIComponent(this.creds.bankAccountId ?? '')}&emitted_at_from=${encodeURIComponent(since.toISOString())}&per_page=100`);
    return (j.transactions ?? [])
      .filter((t) => t.operation_type === 'card' && t.side === 'debit' && t.card_id)
      .map((t) => ({
        providerTxId: t.transaction_id ?? t.id ?? '',
        providerCardId: t.card_id!,
        amountCents: Math.round(Math.abs(t.amount) * 100),
        currency: t.currency.toUpperCase(),
        merchantName: t.label,
        status: t.status === 'completed' ? 'posted' : t.status === 'pending' ? 'pending' : t.status === 'reversed' ? 'reversed' : 'declined',
        occurredAt: new Date(t.settled_at ?? t.emitted_at),
      }));
  }
}
