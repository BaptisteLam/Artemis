/** Types des lignes de la base Artemis (écrits à la main, alignés sur migrations/*.sql). */
export type Plan = 'sandbox' | 'builder' | 'team' | 'agency' | 'business';
export type MemberRole = 'owner' | 'admin' | 'approver' | 'viewer';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'issued' | 'failed' | 'canceled' | 'completed';
export type CardStatus = 'active' | 'pending_bank_sca' | 'used' | 'canceled' | 'expired';
export type MatchStatus = 'matched' | 'mismatch' | 'unmatched';
export type BankProvider = 'sandbox' | 'stripe' | 'qonto' | 'revolut';

export interface OrganizationRow {
  id: string;
  name: string;
  plan: Plan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  frozen_at: string | null;
  card_delivery: 'issuer_link' | 'direct';
  created_at: string;
}
export interface MembershipRow { org_id: string; user_id: string; email: string | null; role: MemberRole; created_at: string }
export interface InvitationRow { id: string; org_id: string; email: string; role: MemberRole; token_hash: string; invited_by: string | null; expires_at: string; accepted_at: string | null; created_at: string }
export interface BankConnectionRow { id: string; org_id: string; provider: BankProvider; label: string; credentials_ciphertext: string; status: string; last_sync_at: string | null; created_at: string }
export interface AgentRow { id: string; org_id: string; name: string; platform: string; token_hash: string; token_prefix: string; bank_connection_id: string | null; status: 'active' | 'frozen'; last_used_at: string | null; created_at: string }
export interface PolicyRow {
  agent_id: string;
  monthly_budget_cents: number;
  per_tx_limit_cents: number;
  currencies: string[];
  merchant_allow: string[];
  merchant_deny: string[];
  mcc_allow: string[];
  mcc_deny: string[];
  auto_approve_below_cents: number;
  card_ttl_minutes: number;
  request_ttl_minutes: number;
  freeze_on_mismatch: boolean;
  updated_at: string;
}
export interface CardRequestRow {
  id: string;
  org_id: string;
  agent_id: string;
  amount_cents: number;
  currency: string;
  merchant: string;
  mcc: string | null;
  purpose: string;
  card_ttl_minutes: number | null;
  status: RequestStatus;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  expires_at: string;
  created_at: string;
}
export interface MandateRow {
  request_id: string;
  org_id: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  signed_by: string | null;
  passkey_id: string | null;
  signature: string | null;
  authenticator_data: string | null;
  client_data_json: string | null;
  auto_approved: boolean;
  signed_at: string;
}
export interface CardRow {
  id: string;
  request_id: string;
  org_id: string;
  bank_connection_id: string | null;
  provider_card_id: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  status: CardStatus;
  revealed_at: string | null;
  expires_at: string;
  created_at: string;
}
export interface TransactionRow {
  id: string;
  org_id: string;
  card_id: string | null;
  provider_tx_id: string;
  bank_connection_id: string | null;
  amount_cents: number;
  currency: string;
  merchant_name: string;
  mcc: string | null;
  status: string;
  occurred_at: string;
  match_status: MatchStatus;
  created_at: string;
}
export interface ReceiptRow { id: string; org_id: string; request_id: string; storage_path: string; filename: string; content_type: string; size_bytes: number; uploaded_by: string; created_at: string }
export interface AuditRow { id: number; org_id: string; actor_type: 'user' | 'agent' | 'system'; actor_id: string; action: string; subject: string; data: Record<string, unknown>; prev_hash: string | null; hash: string; created_at: string }
export interface PasskeyRow { id: string; user_id: string; credential_id: string; public_key: string; counter: number; transports: string[]; name: string | null; created_at: string }
export interface PushSubscriptionRow { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; created_at: string }
export interface WaitlistRow { id: string; email: string; company: string | null; use_case: string | null; created_at: string }
