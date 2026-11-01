import { randomToken, sha256Hex } from '@artemis/shared';
import type { BankConnector, BankTransaction, CardDetails, ConnectorDeps, CreateCardInput, CreatedCard } from './types';

/** État persistant de la banque simulée. Aucun numéro de carte n'y figure : il est dérivé de la graine. */
export interface SandboxState {
  seed: string;
  cards: Record<
    string,
    { limitCents: number; currency: string; merchant: string; label: string; status: 'active' | 'used' | 'canceled'; expiresAt: string; idempotencyKey: string }
  >;
  transactions: Array<Omit<BankTransaction, 'occurredAt'> & { occurredAt: string }>;
}

export function newSandboxState(): SandboxState {
  return { seed: randomToken(16), cards: {}, transactions: [] };
}

function luhnDigit(partial: string): number {
  let sum = 0;
  for (let i = 0; i < partial.length; i++) {
    let d = Number(partial[partial.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export class SandboxConnector implements BankConnector {
  readonly provider = 'sandbox' as const;
  private readonly now: () => Date;

  constructor(
    private readonly state: SandboxState,
    private readonly deps: ConnectorDeps = {},
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  private async persist() {
    await this.deps.onCredentialsUpdate?.(this.state);
  }

  private async details(id: string): Promise<CardDetails> {
    const h = await sha256Hex(`${this.state.seed}:${id}`);
    const digits = [...h].map((ch) => parseInt(ch, 16) % 10).join('');
    const partial = `4242${digits.slice(0, 11)}`;
    const exp = new Date(this.state.cards[id]?.expiresAt ?? this.now());
    return {
      number: `${partial}${luhnDigit(partial)}`,
      expMonth: exp.getUTCMonth() + 1,
      expYear: exp.getUTCFullYear() + 3,
      cvc: digits.slice(11, 14),
      name: 'ARTEMIS SANDBOX',
    };
  }

  async testConnection() {
    return { ok: true, detail: 'Banque simulée' };
  }

  async createSingleUseCard(input: CreateCardInput): Promise<CreatedCard> {
    let id = Object.keys(this.state.cards).find((k) => this.state.cards[k]!.idempotencyKey === input.idempotencyKey);
    if (!id) {
      id = `sbx_card_${randomToken(9)}`;
      this.state.cards[id] = {
        limitCents: input.amountCents,
        currency: input.currency,
        merchant: input.merchant,
        label: input.label,
        status: 'active',
        expiresAt: input.expiresAt.toISOString(),
        idempotencyKey: input.idempotencyKey,
      };
      await this.persist();
    }
    const d = await this.details(id);
    return { providerCardId: id, last4: d.number.slice(-4), expMonth: d.expMonth, expYear: d.expYear, status: 'active' };
  }

  async revealCard(providerCardId: string): Promise<CardDetails> {
    if (!this.state.cards[providerCardId]) throw new Error('card_not_found');
    return this.details(providerCardId);
  }

  async cancelCard(providerCardId: string): Promise<void> {
    const c = this.state.cards[providerCardId];
    if (c && c.status === 'active') {
      c.status = 'canceled';
      await this.persist();
    }
  }

  /** Simule un paiement chez un marchand (Sandbox uniquement). */
  async simulatePayment(providerCardId: string, p: { amountCents: number; merchantName: string; mcc?: string }): Promise<BankTransaction> {
    const c = this.state.cards[providerCardId];
    const now = this.now();
    const ok = !!c && c.status === 'active' && p.amountCents <= c.limitCents && new Date(c.expiresAt) > now;
    const tx: BankTransaction = {
      providerTxId: `sbx_tx_${randomToken(9)}`,
      providerCardId,
      amountCents: p.amountCents,
      currency: c?.currency ?? 'EUR',
      merchantName: p.merchantName,
      mcc: p.mcc,
      status: ok ? 'posted' : 'declined',
      occurredAt: now,
    };
    if (ok) c!.status = 'used';
    this.state.transactions.push({ ...tx, occurredAt: now.toISOString() });
    await this.persist();
    return tx;
  }

  async listTransactions(since: Date): Promise<BankTransaction[]> {
    return this.state.transactions
      .filter((t) => new Date(t.occurredAt) >= since)
      .map((t) => ({ ...t, occurredAt: new Date(t.occurredAt) }));
  }
}
