export type Provider = 'sandbox' | 'stripe' | 'qonto' | 'revolut';

export interface BankTransaction {
  providerTxId: string;
  providerCardId: string;
  amountCents: number;
  currency: string;
  merchantName: string;
  mcc?: string;
  status: 'pending' | 'posted' | 'declined' | 'reversed';
  occurredAt: Date;
}

export interface CreateCardInput {
  amountCents: number;
  currency: string;
  merchant: string;
  expiresAt: Date;
  label: string;
  idempotencyKey: string;
  /** Carte d'abonnement : plafond par mois au lieu d'un usage unique. */
  recurring?: 'month';
}

export interface CreatedCard {
  providerCardId: string;
  last4: string;
  expMonth: number;
  expYear: number;
  status: 'active' | 'pending_bank_sca';
  scaUrl?: string;
}

export interface CardDetails {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  name: string;
}

export interface BankConnector {
  readonly provider: Provider;
  testConnection(): Promise<{ ok: boolean; detail?: string }>;
  createSingleUseCard(input: CreateCardInput): Promise<CreatedCard>;
  revealCard(providerCardId: string): Promise<CardDetails>;
  cancelCard(providerCardId: string): Promise<void>;
  listTransactions(since: Date): Promise<BankTransaction[]>;
}

export interface ConnectorDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  /** Appelé quand le connecteur fait évoluer ses identifiants (jeton rafraîchi, état Sandbox…). */
  onCredentialsUpdate?: (credentials: unknown) => Promise<void>;
}
