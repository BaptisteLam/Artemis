import { ArtemisError, sha256Hex } from '@artemis/shared';
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

const COMMITTED = new Set(['pending', 'approved', 'issued', 'completed']);
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const clone = <T>(v: T): T => structuredClone(v);
const byCreatedDesc = (a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at);

function notFound(what: string): never {
  throw new ArtemisError('not_found', `${what} introuvable`);
}

/**
 * Implémentation en mémoire (tests, développement local, E2E). Les sections critiques
 * ne contiennent aucun `await`, ce qui les rend atomiques dans l'isolat JavaScript.
 */
export class MemoryStore implements Store {
  orgs = new Map<string, OrganizationRow>();
  memberships: MembershipRow[] = [];
  invitations = new Map<string, InvitationRow>();
  connections = new Map<string, BankConnectionRow>();
  agents = new Map<string, AgentRow>();
  policies = new Map<string, PolicyRow>();
  requests = new Map<string, CardRequestRow>();
  mandates = new Map<string, MandateRow>();
  cards = new Map<string, CardRow>();
  transactions = new Map<string, TransactionRow>();
  receipts = new Map<string, ReceiptRow>();
  files = new Map<string, { body: ArrayBuffer; contentType: string }>();
  audit: AuditRow[] = [];
  passkeys = new Map<string, PasskeyRow>();
  push = new Map<string, PushSubscriptionRow>();
  usage = new Map<string, number>();
  waitlist = new Map<string, WaitlistRow>();
  kv = new Map<string, { value: unknown; expiresAt: number }>();
  private auditSeq = 0;
  private auditLock: Promise<unknown> = Promise.resolve();

  // Organisations
  async createOrganization(input: { name: string }) {
    const row: OrganizationRow = { id: uuid(), name: input.name, plan: 'sandbox', stripe_customer_id: null, stripe_subscription_id: null, subscription_status: null, frozen_at: null, created_at: now() };
    this.orgs.set(row.id, row);
    return clone(row);
  }
  async getOrganization(id: string) {
    const o = this.orgs.get(id);
    return o ? clone(o) : null;
  }
  async updateOrganization(id: string, patch: Partial<OrganizationRow>) {
    const o = this.orgs.get(id) ?? notFound('Organisation');
    Object.assign(o, patch, { id });
    return clone(o);
  }
  async listOrganizations(opts: { limit?: number; offset?: number } = {}) {
    const all = [...this.orgs.values()].sort(byCreatedDesc);
    return clone(all.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 1000)));
  }
  async findOrganizationByStripeCustomer(customerId: string) {
    const o = [...this.orgs.values()].find((x) => x.stripe_customer_id === customerId);
    return o ? clone(o) : null;
  }

  // Membres
  async addMembership(row: Omit<MembershipRow, 'created_at'>) {
    const existing = this.memberships.find((m) => m.org_id === row.org_id && m.user_id === row.user_id);
    if (existing) {
      existing.role = row.role;
      return clone(existing);
    }
    const m: MembershipRow = { ...row, created_at: now() };
    this.memberships.push(m);
    return clone(m);
  }
  async getMembership(orgId: string, userId: string) {
    const m = this.memberships.find((x) => x.org_id === orgId && x.user_id === userId);
    return m ? clone(m) : null;
  }
  async listMembershipsForUser(userId: string) {
    return clone(this.memberships.filter((m) => m.user_id === userId));
  }
  async listMembers(orgId: string) {
    return clone(this.memberships.filter((m) => m.org_id === orgId));
  }
  async updateMembershipRole(orgId: string, userId: string, role: MembershipRow['role']) {
    const m = this.memberships.find((x) => x.org_id === orgId && x.user_id === userId) ?? notFound('Membre');
    m.role = role;
  }
  async removeMembership(orgId: string, userId: string) {
    this.memberships = this.memberships.filter((m) => !(m.org_id === orgId && m.user_id === userId));
  }

  // Invitations
  async createInvitation(row: Omit<InvitationRow, 'id' | 'created_at' | 'accepted_at'>) {
    const inv: InvitationRow = { ...row, id: uuid(), created_at: now(), accepted_at: null };
    this.invitations.set(inv.id, inv);
    return clone(inv);
  }
  async getInvitationByTokenHash(hash: string) {
    const i = [...this.invitations.values()].find((x) => x.token_hash === hash);
    return i ? clone(i) : null;
  }
  async markInvitationAccepted(id: string) {
    const i = this.invitations.get(id);
    if (i) i.accepted_at = now();
  }
  async listInvitations(orgId: string) {
    return clone([...this.invitations.values()].filter((i) => i.org_id === orgId && !i.accepted_at));
  }
  async deleteInvitation(orgId: string, id: string) {
    if (this.invitations.get(id)?.org_id === orgId) this.invitations.delete(id);
  }

  // Connexions bancaires
  async createBankConnection(row: Omit<BankConnectionRow, 'id' | 'created_at' | 'last_sync_at' | 'status'>) {
    const c: BankConnectionRow = { ...row, id: uuid(), status: 'active', last_sync_at: null, created_at: now() };
    this.connections.set(c.id, c);
    return clone(c);
  }
  async getBankConnection(id: string) {
    const c = this.connections.get(id);
    return c ? clone(c) : null;
  }
  async listBankConnections(orgId: string) {
    return clone([...this.connections.values()].filter((c) => c.org_id === orgId));
  }
  async listAllBankConnections() {
    return clone([...this.connections.values()]);
  }
  async updateBankConnection(id: string, patch: Partial<BankConnectionRow>) {
    const c = this.connections.get(id);
    if (c) Object.assign(c, patch, { id });
  }
  async deleteBankConnection(id: string) {
    this.connections.delete(id);
    for (const a of this.agents.values()) if (a.bank_connection_id === id) a.bank_connection_id = null;
  }

  // Agents
  async createAgent(row: Omit<AgentRow, 'id' | 'created_at' | 'last_used_at' | 'status'>) {
    const a: AgentRow = { ...row, id: uuid(), status: 'active', last_used_at: null, created_at: now() };
    this.agents.set(a.id, a);
    return clone(a);
  }
  async getAgent(id: string) {
    const a = this.agents.get(id);
    return a ? clone(a) : null;
  }
  async getAgentByTokenHash(hash: string) {
    const a = [...this.agents.values()].find((x) => x.token_hash === hash);
    return a ? clone(a) : null;
  }
  async listAgents(orgId: string) {
    return clone([...this.agents.values()].filter((a) => a.org_id === orgId).sort(byCreatedDesc));
  }
  async updateAgent(id: string, patch: Partial<AgentRow>) {
    const a = this.agents.get(id) ?? notFound('Agent');
    Object.assign(a, patch, { id });
    return clone(a);
  }
  async deleteAgent(id: string) {
    this.agents.delete(id);
    this.policies.delete(id);
  }
  async getPolicy(agentId: string) {
    const p = this.policies.get(agentId);
    return p ? clone(p) : null;
  }
  async upsertPolicy(row: Omit<PolicyRow, 'updated_at'>) {
    const p: PolicyRow = { ...row, updated_at: now() };
    this.policies.set(row.agent_id, p);
    return clone(p);
  }

  // Demandes
  async createCardRequestAtomic(input: NewCardRequest, budgetCents: number, monthStart: Date) {
    const from = monthStart.toISOString();
    let spent = 0;
    for (const r of this.requests.values()) {
      if (r.agent_id === input.agent_id && r.created_at >= from && COMMITTED.has(r.status)) spent += r.amount_cents;
    }
    if (spent + input.amount_cents > budgetCents) {
      throw new ArtemisError('over_monthly_budget', 'Budget mensuel dépassé.');
    }
    const row: CardRequestRow = {
      id: uuid(),
      org_id: input.org_id,
      agent_id: input.agent_id,
      amount_cents: input.amount_cents,
      currency: input.currency,
      merchant: input.merchant,
      mcc: input.mcc ?? null,
      purpose: input.purpose,
      card_ttl_minutes: input.card_ttl_minutes ?? null,
      status: input.status ?? 'pending',
      decision_reason: input.decision_reason ?? null,
      decided_by: null,
      decided_at: null,
      expires_at: input.expires_at,
      created_at: now(),
    };
    this.requests.set(row.id, row);
    return clone(row);
  }
  async getCardRequest(id: string) {
    const r = this.requests.get(id);
    return r ? clone(r) : null;
  }
  async updateCardRequest(id: string, patch: Partial<CardRequestRow>, expectedStatus?: CardRequestRow['status']) {
    const r = this.requests.get(id);
    if (!r) return null;
    if (expectedStatus && r.status !== expectedStatus) return null;
    Object.assign(r, patch, { id });
    return clone(r);
  }
  async listCardRequests(orgId: string, f: { status?: CardRequestRow['status']; agentId?: string; limit?: number; from?: Date; to?: Date } = {}) {
    return clone(
      [...this.requests.values()]
        .filter((r) => r.org_id === orgId)
        .filter((r) => !f.status || r.status === f.status)
        .filter((r) => !f.agentId || r.agent_id === f.agentId)
        .filter((r) => !f.from || r.created_at >= f.from.toISOString())
        .filter((r) => !f.to || r.created_at < f.to.toISOString())
        .sort(byCreatedDesc)
        .slice(0, f.limit ?? 500),
    );
  }
  async listExpiredPendingRequests(at: Date) {
    return clone([...this.requests.values()].filter((r) => r.status === 'pending' && r.expires_at <= at.toISOString()));
  }
  async sumCommitted(agentId: string, from: Date) {
    let s = 0;
    for (const r of this.requests.values()) {
      if (r.agent_id === agentId && r.created_at >= from.toISOString() && COMMITTED.has(r.status)) s += r.amount_cents;
    }
    return s;
  }
  async countRequestsSince(from: Date) {
    return [...this.requests.values()].filter((r) => r.created_at >= from.toISOString()).length;
  }

  // Mandats
  async createMandate(row: MandateRow) {
    this.mandates.set(row.request_id, clone(row));
    return clone(row);
  }
  async getMandate(requestId: string) {
    const m = this.mandates.get(requestId);
    return m ? clone(m) : null;
  }

  // Cartes
  async createCard(row: Omit<CardRow, 'id' | 'created_at' | 'revealed_at'>) {
    const c: CardRow = { ...row, id: uuid(), revealed_at: null, created_at: now() };
    this.cards.set(c.id, c);
    return clone(c);
  }
  async getCard(id: string) {
    const c = this.cards.get(id);
    return c ? clone(c) : null;
  }
  async getCardByRequest(requestId: string) {
    const c = [...this.cards.values()].find((x) => x.request_id === requestId);
    return c ? clone(c) : null;
  }
  async getCardByProviderId(bankConnectionId: string, providerCardId: string) {
    const c = [...this.cards.values()].find((x) => x.bank_connection_id === bankConnectionId && x.provider_card_id === providerCardId);
    return c ? clone(c) : null;
  }
  async markCardRevealed(cardId: string) {
    const c = this.cards.get(cardId);
    if (!c || c.revealed_at) return null;
    c.revealed_at = now();
    return clone(c);
  }
  async updateCard(id: string, patch: Partial<CardRow>) {
    const c = this.cards.get(id) ?? notFound('Carte');
    Object.assign(c, patch, { id });
    return clone(c);
  }
  async listCards(orgId: string, f: { status?: CardRow['status']; limit?: number } = {}) {
    return clone(
      [...this.cards.values()]
        .filter((c) => c.org_id === orgId && (!f.status || c.status === f.status))
        .sort(byCreatedDesc)
        .slice(0, f.limit ?? 500),
    );
  }
  async listExpiredActiveCards(at: Date) {
    return clone([...this.cards.values()].filter((c) => (c.status === 'active' || c.status === 'pending_bank_sca') && c.expires_at <= at.toISOString()));
  }

  // Transactions
  async upsertTransaction(row: Omit<TransactionRow, 'id' | 'created_at' | 'match_status'> & { match_status?: TransactionRow['match_status'] }) {
    const existing = [...this.transactions.values()].find(
      (t) => t.bank_connection_id === row.bank_connection_id && t.provider_tx_id === row.provider_tx_id,
    );
    if (existing) {
      Object.assign(existing, row, { id: existing.id, match_status: row.match_status ?? existing.match_status });
      return clone(existing);
    }
    const t: TransactionRow = { ...row, match_status: row.match_status ?? 'unmatched', id: uuid(), created_at: now() };
    this.transactions.set(t.id, t);
    return clone(t);
  }
  async updateTransaction(id: string, patch: Partial<TransactionRow>) {
    const t = this.transactions.get(id);
    if (t) Object.assign(t, patch, { id });
  }
  async listTransactions(orgId: string, f: { from?: Date; to?: Date; limit?: number } = {}) {
    return clone(
      [...this.transactions.values()]
        .filter((t) => t.org_id === orgId)
        .filter((t) => !f.from || t.occurred_at >= f.from.toISOString())
        .filter((t) => !f.to || t.occurred_at < f.to.toISOString())
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        .slice(0, f.limit ?? 1000),
    );
  }

  // Justificatifs
  async createReceipt(row: Omit<ReceiptRow, 'id' | 'created_at'>) {
    const r: ReceiptRow = { ...row, id: uuid(), created_at: now() };
    this.receipts.set(r.id, r);
    return clone(r);
  }
  async getReceipt(id: string) {
    const r = this.receipts.get(id);
    return r ? clone(r) : null;
  }
  async listReceipts(orgId: string, requestId?: string) {
    return clone([...this.receipts.values()].filter((r) => r.org_id === orgId && (!requestId || r.request_id === requestId)));
  }
  async putFile(path: string, body: ArrayBuffer, contentType: string) {
    this.files.set(path, { body, contentType });
  }
  async getFile(path: string) {
    return this.files.get(path) ?? null;
  }

  // Audit
  async appendAudit(input: AuditInput) {
    const run = async () => {
      const prev = [...this.audit].reverse().find((a) => a.org_id === input.org_id);
      const prevHash = prev?.hash ?? null;
      const hash = await sha256Hex((prevHash ?? '') + input.canonical);
      const row: AuditRow = {
        id: ++this.auditSeq,
        org_id: input.org_id,
        actor_type: input.actor_type,
        actor_id: input.actor_id,
        action: input.action,
        subject: input.subject,
        data: clone(input.data),
        prev_hash: prevHash,
        hash,
        created_at: now(),
      };
      this.audit.push(row);
      return clone(row);
    };
    const p = this.auditLock.then(run, run);
    this.auditLock = p.catch(() => undefined);
    return p;
  }
  async listAudit(orgId: string, opts: { limit?: number; beforeId?: number } = {}) {
    return clone(
      this.audit
        .filter((a) => a.org_id === orgId && (!opts.beforeId || a.id < opts.beforeId))
        .sort((a, b) => b.id - a.id)
        .slice(0, opts.limit ?? 100),
    );
  }
  async listAllAudit(orgId: string) {
    return clone(this.audit.filter((a) => a.org_id === orgId).sort((a, b) => a.id - b.id));
  }

  // Passkeys et push
  async listPasskeys(userId: string) {
    return clone([...this.passkeys.values()].filter((p) => p.user_id === userId));
  }
  async getPasskeyByCredentialId(credentialId: string) {
    const p = [...this.passkeys.values()].find((x) => x.credential_id === credentialId);
    return p ? clone(p) : null;
  }
  async savePasskey(row: Omit<PasskeyRow, 'id' | 'created_at'>) {
    const p: PasskeyRow = { ...row, id: uuid(), created_at: now() };
    this.passkeys.set(p.id, p);
    return clone(p);
  }
  async updatePasskeyCounter(id: string, counter: number) {
    const p = this.passkeys.get(id);
    if (p) p.counter = counter;
  }
  async deletePasskey(userId: string, id: string) {
    if (this.passkeys.get(id)?.user_id === userId) this.passkeys.delete(id);
  }
  async listPushSubscriptions(userIds: string[]) {
    return clone([...this.push.values()].filter((p) => userIds.includes(p.user_id)));
  }
  async savePushSubscription(row: Omit<PushSubscriptionRow, 'id' | 'created_at'>) {
    this.push.set(row.endpoint, { ...row, id: uuid(), created_at: now() });
  }
  async deletePushSubscription(endpoint: string) {
    this.push.delete(endpoint);
  }

  // Usage, liste d'attente, kv
  async incrementUsage(orgId: string, period: string) {
    const k = `${orgId}:${period}`;
    const n = (this.usage.get(k) ?? 0) + 1;
    this.usage.set(k, n);
    return n;
  }
  async getUsage(orgId: string, period: string) {
    return this.usage.get(`${orgId}:${period}`) ?? 0;
  }
  async waitlistAdd(row: { email: string; company?: string | null; use_case?: string | null }) {
    const email = row.email.toLowerCase();
    if (this.waitlist.has(email)) return;
    this.waitlist.set(email, { id: uuid(), email, company: row.company ?? null, use_case: row.use_case ?? null, created_at: now() });
  }
  async listWaitlist(limit: number) {
    return clone([...this.waitlist.values()].sort(byCreatedDesc).slice(0, limit));
  }
  async countWaitlist() {
    return this.waitlist.size;
  }
  async hitRateLimit(key: string, windowSec: number, max: number) {
    const t = Date.now();
    const e = this.kv.get(`rl:${key}`);
    if (!e || e.expiresAt < t) {
      this.kv.set(`rl:${key}`, { value: 1, expiresAt: t + windowSec * 1000 });
      return 1 <= max;
    }
    const n = (e.value as number) + 1;
    e.value = n;
    return n <= max;
  }
  async kvSet(key: string, value: unknown, ttlSec: number) {
    this.kv.set(key, { value: clone(value), expiresAt: Date.now() + ttlSec * 1000 });
  }
  async kvTake<T>(key: string) {
    const e = this.kv.get(key);
    this.kv.delete(key);
    if (!e || e.expiresAt < Date.now()) return null;
    return e.value as T;
  }
}
