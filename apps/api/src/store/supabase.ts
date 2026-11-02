import { ArtemisError } from '@artemis/shared';
import type {
  AgentRow,
  AuditRow,
  BankConnectionRow,
  CardRequestRow,
  CardRow,
  InvitationRow,
  MandateRow,
  MembershipRow,
  OrganizationRow,
  PasskeyRow,
  PolicyRow,
  PushSubscriptionRow,
  ReceiptRow,
  TransactionRow,
  WaitlistRow,
} from '@artemis/db';
import type { AuditInput, NewCardRequest, Store } from './types';

type Query = Record<string, string | number | undefined>;
const COMMITTED = '(pending,approved,issued,completed)';
const BUCKET = 'receipts';

/** Store de production : PostgREST + Storage de Supabase, appelés avec la clé service_role. */
export class SupabaseStore implements Store {
  constructor(
    private readonly url: string,
    private readonly key: string,
    private readonly f: typeof fetch,
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', ...extra };
  }

  private qs(q: Query) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined) p.append(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  private async req<T>(method: string, path: string, opts: { query?: Query; body?: unknown; prefer?: string } = {}): Promise<T> {
    const res = await this.f(`${this.url}/rest/v1/${path}${this.qs(opts.query ?? {})}`, {
      method,
      headers: this.headers(opts.prefer ? { Prefer: opts.prefer } : {}),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (!res.ok) {
      const text = await res.text();
      if (text.includes('over_monthly_budget')) throw new ArtemisError('over_monthly_budget', 'Budget mensuel dépassé.');
      throw new Error(`supabase ${method} ${path} ${res.status}: ${text.slice(0, 200)}`);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private select<T>(table: string, query: Query) {
    return this.req<T[]>('GET', table, { query: { select: '*', ...query } });
  }
  private async first<T>(table: string, query: Query): Promise<T | null> {
    const rows = await this.select<T>(table, { ...query, limit: 1 });
    return rows[0] ?? null;
  }
  private async insert<T>(table: string, body: unknown): Promise<T> {
    const rows = await this.req<T[]>('POST', table, { body, prefer: 'return=representation' });
    return rows[0]!;
  }
  private async patch<T>(table: string, query: Query, body: unknown): Promise<T[]> {
    return this.req<T[]>('PATCH', table, { query, body, prefer: 'return=representation' });
  }
  private del(table: string, query: Query) {
    return this.req<void>('DELETE', table, { query });
  }
  private rpc<T>(fn: string, args: Record<string, unknown>) {
    return this.req<T>('POST', `rpc/${fn}`, { body: args });
  }
  private async count(table: string, query: Query): Promise<number> {
    const res = await this.f(`${this.url}/rest/v1/${table}${this.qs({ select: 'id', limit: 1, ...query })}`, {
      headers: this.headers({ Prefer: 'count=exact' }),
    });
    const range = res.headers.get('content-range') ?? '*/0';
    return Number(range.split('/')[1] ?? 0);
  }

  // Organisations
  createOrganization(input: { name: string }) {
    return this.insert<OrganizationRow>('organizations', input);
  }
  getOrganization(id: string) {
    return this.first<OrganizationRow>('organizations', { id: `eq.${id}` });
  }
  async updateOrganization(id: string, patch: Partial<OrganizationRow>) {
    const rows = await this.patch<OrganizationRow>('organizations', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new ArtemisError('not_found', 'Organisation introuvable');
    return rows[0];
  }
  listOrganizations(opts: { limit?: number; offset?: number } = {}) {
    return this.select<OrganizationRow>('organizations', { order: 'created_at.desc', limit: opts.limit ?? 1000, offset: opts.offset ?? 0 });
  }
  findOrganizationByStripeCustomer(customerId: string) {
    return this.first<OrganizationRow>('organizations', { stripe_customer_id: `eq.${customerId}` });
  }

  // Membres
  async addMembership(row: Omit<MembershipRow, 'created_at'>) {
    const rows = await this.req<MembershipRow[]>('POST', 'memberships', {
      query: { on_conflict: 'org_id,user_id' },
      body: row,
      prefer: 'return=representation,resolution=merge-duplicates',
    });
    return rows[0]!;
  }
  getMembership(orgId: string, userId: string) {
    return this.first<MembershipRow>('memberships', { org_id: `eq.${orgId}`, user_id: `eq.${userId}` });
  }
  listMembershipsForUser(userId: string) {
    return this.select<MembershipRow>('memberships', { user_id: `eq.${userId}`, order: 'created_at.asc' });
  }
  listMembers(orgId: string) {
    return this.select<MembershipRow>('memberships', { org_id: `eq.${orgId}`, order: 'created_at.asc' });
  }
  async updateMembershipRole(orgId: string, userId: string, role: MembershipRow['role']) {
    await this.patch('memberships', { org_id: `eq.${orgId}`, user_id: `eq.${userId}` }, { role });
  }
  removeMembership(orgId: string, userId: string) {
    return this.del('memberships', { org_id: `eq.${orgId}`, user_id: `eq.${userId}` });
  }

  // Invitations
  createInvitation(row: Omit<InvitationRow, 'id' | 'created_at' | 'accepted_at'>) {
    return this.insert<InvitationRow>('invitations', row);
  }
  getInvitationByTokenHash(hash: string) {
    return this.first<InvitationRow>('invitations', { token_hash: `eq.${hash}` });
  }
  async markInvitationAccepted(id: string) {
    await this.patch('invitations', { id: `eq.${id}` }, { accepted_at: new Date().toISOString() });
  }
  listInvitations(orgId: string) {
    return this.select<InvitationRow>('invitations', { org_id: `eq.${orgId}`, accepted_at: 'is.null', order: 'created_at.desc' });
  }
  deleteInvitation(orgId: string, id: string) {
    return this.del('invitations', { org_id: `eq.${orgId}`, id: `eq.${id}` });
  }

  // Connexions bancaires
  createBankConnection(row: Omit<BankConnectionRow, 'id' | 'created_at' | 'last_sync_at' | 'status'>) {
    return this.insert<BankConnectionRow>('bank_connections', row);
  }
  getBankConnection(id: string) {
    return this.first<BankConnectionRow>('bank_connections', { id: `eq.${id}` });
  }
  listBankConnections(orgId: string) {
    return this.select<BankConnectionRow>('bank_connections', { org_id: `eq.${orgId}`, order: 'created_at.asc' });
  }
  listAllBankConnections() {
    return this.select<BankConnectionRow>('bank_connections', { status: 'eq.active' });
  }
  async updateBankConnection(id: string, patch: Partial<BankConnectionRow>) {
    await this.patch('bank_connections', { id: `eq.${id}` }, patch);
  }
  deleteBankConnection(id: string) {
    return this.del('bank_connections', { id: `eq.${id}` });
  }

  // Agents
  createAgent(row: Omit<AgentRow, 'id' | 'created_at' | 'last_used_at' | 'status'>) {
    return this.insert<AgentRow>('agents', row);
  }
  getAgent(id: string) {
    return this.first<AgentRow>('agents', { id: `eq.${id}` });
  }
  getAgentByTokenHash(hash: string) {
    return this.first<AgentRow>('agents', { token_hash: `eq.${hash}` });
  }
  listAgents(orgId: string) {
    return this.select<AgentRow>('agents', { org_id: `eq.${orgId}`, order: 'created_at.desc' });
  }
  async updateAgent(id: string, patch: Partial<AgentRow>) {
    const rows = await this.patch<AgentRow>('agents', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new ArtemisError('not_found', 'Agent introuvable');
    return rows[0];
  }
  deleteAgent(id: string) {
    return this.del('agents', { id: `eq.${id}` });
  }
  getPolicy(agentId: string) {
    return this.first<PolicyRow>('policies', { agent_id: `eq.${agentId}` });
  }
  async upsertPolicy(row: Omit<PolicyRow, 'updated_at'>) {
    const rows = await this.req<PolicyRow[]>('POST', 'policies', {
      query: { on_conflict: 'agent_id' },
      body: { ...row, updated_at: new Date().toISOString() },
      prefer: 'return=representation,resolution=merge-duplicates',
    });
    return rows[0]!;
  }

  // Demandes
  createCardRequestAtomic(input: NewCardRequest, budgetCents: number, monthStart: Date) {
    return this.rpc<CardRequestRow>('create_card_request', {
      p: input,
      p_budget_cents: budgetCents,
      p_month_start: monthStart.toISOString(),
    });
  }
  getCardRequest(id: string) {
    return this.first<CardRequestRow>('card_requests', { id: `eq.${id}` });
  }
  async updateCardRequest(id: string, patch: Partial<CardRequestRow>, expectedStatus?: CardRequestRow['status']) {
    const rows = await this.patch<CardRequestRow>(
      'card_requests',
      { id: `eq.${id}`, status: expectedStatus ? `eq.${expectedStatus}` : undefined },
      patch,
    );
    return rows[0] ?? null;
  }
  listCardRequests(orgId: string, f: { status?: CardRequestRow['status']; agentId?: string; limit?: number; from?: Date; to?: Date } = {}) {
    const q: Query = { org_id: `eq.${orgId}`, order: 'created_at.desc', limit: f.limit ?? 500 };
    if (f.status) q.status = `eq.${f.status}`;
    if (f.agentId) q.agent_id = `eq.${f.agentId}`;
    if (f.from && f.to) q.and = `(created_at.gte.${f.from.toISOString()},created_at.lt.${f.to.toISOString()})`;
    else if (f.from) q.created_at = `gte.${f.from.toISOString()}`;
    else if (f.to) q.created_at = `lt.${f.to.toISOString()}`;
    return this.select<CardRequestRow>('card_requests', q);
  }
  listExpiredPendingRequests(now: Date) {
    return this.select<CardRequestRow>('card_requests', { status: 'eq.pending', expires_at: `lte.${now.toISOString()}`, limit: 500 });
  }
  async sumCommitted(agentId: string, from: Date) {
    const rows = await this.req<{ amount_cents: number }[]>('GET', 'card_requests', {
      query: { select: 'amount_cents', agent_id: `eq.${agentId}`, created_at: `gte.${from.toISOString()}`, status: `in.${COMMITTED}` },
    });
    return rows.reduce((s, r) => s + Number(r.amount_cents), 0);
  }
  countRequestsSince(from: Date) {
    return this.count('card_requests', { created_at: `gte.${from.toISOString()}` });
  }

  // Mandats
  createMandate(row: MandateRow) {
    return this.insert<MandateRow>('mandates', row);
  }
  getMandate(requestId: string) {
    return this.first<MandateRow>('mandates', { request_id: `eq.${requestId}` });
  }

  // Cartes
  createCard(row: Omit<CardRow, 'id' | 'created_at' | 'revealed_at'>) {
    return this.insert<CardRow>('cards', row);
  }
  getCard(id: string) {
    return this.first<CardRow>('cards', { id: `eq.${id}` });
  }
  getCardByRequest(requestId: string) {
    return this.first<CardRow>('cards', { request_id: `eq.${requestId}` });
  }
  getCardByProviderId(bankConnectionId: string, providerCardId: string) {
    return this.first<CardRow>('cards', { bank_connection_id: `eq.${bankConnectionId}`, provider_card_id: `eq.${providerCardId}` });
  }
  async markCardRevealed(cardId: string) {
    const rows = await this.rpc<CardRow[]>('mark_card_revealed', { p_card: cardId });
    return rows?.[0] ?? null;
  }
  async updateCard(id: string, patch: Partial<CardRow>) {
    const rows = await this.patch<CardRow>('cards', { id: `eq.${id}` }, patch);
    if (!rows[0]) throw new ArtemisError('not_found', 'Carte introuvable');
    return rows[0];
  }
  listCards(orgId: string, f: { status?: CardRow['status']; limit?: number } = {}) {
    return this.select<CardRow>('cards', { org_id: `eq.${orgId}`, status: f.status ? `eq.${f.status}` : undefined, order: 'created_at.desc', limit: f.limit ?? 500 });
  }
  listExpiredActiveCards(now: Date) {
    return this.select<CardRow>('cards', { status: 'in.(active,pending_bank_sca)', expires_at: `lte.${now.toISOString()}`, limit: 500 });
  }

  // Transactions
  async upsertTransaction(row: Omit<TransactionRow, 'id' | 'created_at' | 'match_status'> & { match_status?: TransactionRow['match_status'] }) {
    const rows = await this.req<TransactionRow[]>('POST', 'transactions', {
      query: { on_conflict: 'bank_connection_id,provider_tx_id' },
      body: row,
      prefer: 'return=representation,resolution=merge-duplicates',
    });
    return rows[0]!;
  }
  async updateTransaction(id: string, patch: Partial<TransactionRow>) {
    await this.patch('transactions', { id: `eq.${id}` }, patch);
  }
  listTransactions(orgId: string, f: { from?: Date; to?: Date; limit?: number } = {}) {
    const q: Query = { org_id: `eq.${orgId}`, order: 'occurred_at.desc', limit: f.limit ?? 1000 };
    if (f.from && f.to) q.and = `(occurred_at.gte.${f.from.toISOString()},occurred_at.lt.${f.to.toISOString()})`;
    else if (f.from) q.occurred_at = `gte.${f.from.toISOString()}`;
    else if (f.to) q.occurred_at = `lt.${f.to.toISOString()}`;
    return this.select<TransactionRow>('transactions', q);
  }

  // Justificatifs
  createReceipt(row: Omit<ReceiptRow, 'id' | 'created_at'>) {
    return this.insert<ReceiptRow>('receipts', row);
  }
  getReceipt(id: string) {
    return this.first<ReceiptRow>('receipts', { id: `eq.${id}` });
  }
  listReceipts(orgId: string, requestId?: string) {
    return this.select<ReceiptRow>('receipts', { org_id: `eq.${orgId}`, request_id: requestId ? `eq.${requestId}` : undefined, order: 'created_at.desc' });
  }
  async putFile(path: string, body: ArrayBuffer, contentType: string) {
    const res = await this.f(`${this.url}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': contentType, 'x-upsert': 'true' },
      body,
    });
    if (!res.ok) throw new Error(`storage upload ${res.status}`);
  }
  async getFile(path: string) {
    const res = await this.f(`${this.url}/storage/v1/object/${BUCKET}/${path}`, {
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}` },
    });
    if (!res.ok) return null;
    return { body: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }

  // Audit
  appendAudit(input: AuditInput) {
    return this.rpc<AuditRow>('append_audit', {
      p_org: input.org_id,
      p_actor_type: input.actor_type,
      p_actor_id: input.actor_id,
      p_action: input.action,
      p_subject: input.subject,
      p_data: { ...input.data, _canonical: input.canonical },
    });
  }
  listAudit(orgId: string, opts: { limit?: number; beforeId?: number } = {}) {
    return this.select<AuditRow>('audit_log', { org_id: `eq.${orgId}`, id: opts.beforeId ? `lt.${opts.beforeId}` : undefined, order: 'id.desc', limit: opts.limit ?? 100 });
  }
  listAllAudit(orgId: string) {
    return this.select<AuditRow>('audit_log', { org_id: `eq.${orgId}`, order: 'id.asc', limit: 100000 });
  }

  // Passkeys et push
  listPasskeys(userId: string) {
    return this.select<PasskeyRow>('passkeys', { user_id: `eq.${userId}`, order: 'created_at.asc' });
  }
  getPasskeyByCredentialId(credentialId: string) {
    return this.first<PasskeyRow>('passkeys', { credential_id: `eq.${credentialId}` });
  }
  savePasskey(row: Omit<PasskeyRow, 'id' | 'created_at'>) {
    return this.insert<PasskeyRow>('passkeys', row);
  }
  async updatePasskeyCounter(id: string, counter: number) {
    await this.patch('passkeys', { id: `eq.${id}` }, { counter });
  }
  deletePasskey(userId: string, id: string) {
    return this.del('passkeys', { id: `eq.${id}`, user_id: `eq.${userId}` });
  }
  listPushSubscriptions(userIds: string[]) {
    if (!userIds.length) return Promise.resolve([]);
    return this.select<PushSubscriptionRow>('push_subscriptions', { user_id: `in.(${userIds.join(',')})` });
  }
  async savePushSubscription(row: Omit<PushSubscriptionRow, 'id' | 'created_at'>) {
    await this.req('POST', 'push_subscriptions', { query: { on_conflict: 'endpoint' }, body: row, prefer: 'resolution=merge-duplicates' });
  }
  deletePushSubscription(endpoint: string) {
    return this.del('push_subscriptions', { endpoint: `eq.${endpoint}` });
  }

  // Usage, liste d'attente, kv
  incrementUsage(orgId: string, period: string) {
    return this.rpc<number>('increment_usage', { p_org: orgId, p_period: period });
  }
  async getUsage(orgId: string, period: string) {
    const r = await this.first<{ requests: number }>('usage_counters', { org_id: `eq.${orgId}`, period: `eq.${period}` });
    return r?.requests ?? 0;
  }
  incrementOverage(orgId: string, period: string) {
    return this.rpc<number>('increment_overage', { p_org: orgId, p_period: period });
  }
  async getOverage(orgId: string, period: string) {
    const r = await this.first<{ overage: number }>('usage_counters', { org_id: `eq.${orgId}`, period: `eq.${period}` });
    return r?.overage ?? 0;
  }
  async waitlistAdd(row: { email: string; company?: string | null; use_case?: string | null }) {
    await this.req('POST', 'waitlist', {
      query: { on_conflict: 'email' },
      body: { ...row, email: row.email.toLowerCase() },
      prefer: 'resolution=ignore-duplicates',
    });
  }
  listWaitlist(limit: number) {
    return this.select<WaitlistRow>('waitlist', { order: 'created_at.desc', limit });
  }
  countWaitlist() {
    return this.count('waitlist', {});
  }
  hitRateLimit(key: string, windowSec: number, max: number) {
    return this.rpc<boolean>('hit_rate_limit', { p_key: `rl:${key}`, p_window_sec: windowSec, p_max: max });
  }
  async kvSet(key: string, value: unknown, ttlSec: number) {
    await this.req('POST', 'kv', {
      query: { on_conflict: 'key' },
      body: { key, value, expires_at: new Date(Date.now() + ttlSec * 1000).toISOString() },
      prefer: 'resolution=merge-duplicates',
    });
  }
  async kvGet<T>(key: string) {
    const r = await this.first<{ value: T; expires_at: string }>('kv', { key: `eq.${key}` });
    if (!r || new Date(r.expires_at) < new Date()) return null;
    return r.value;
  }
  async kvTake<T>(key: string) {
    const rows = await this.req<{ value: T; expires_at: string }[]>('DELETE', 'kv', { query: { key: `eq.${key}` }, prefer: 'return=representation' });
    const r = rows?.[0];
    if (!r || new Date(r.expires_at) < new Date()) return null;
    return r.value;
  }
}
