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
  RequestStatus,
  TransactionRow,
  WaitlistRow,
} from '@artemis/db';

export type NewCardRequest = Pick<
  CardRequestRow,
  'org_id' | 'agent_id' | 'amount_cents' | 'currency' | 'merchant' | 'mcc' | 'purpose' | 'card_ttl_minutes' | 'expires_at'
> & { status?: RequestStatus; decision_reason?: string | null };

export interface AuditInput {
  org_id: string;
  actor_type: 'user' | 'agent' | 'system';
  actor_id: string;
  action: string;
  subject: string;
  data: Record<string, unknown>;
  /** JSON canonique de l'entrée, haché avec le hash précédent. */
  canonical: string;
}

/**
 * Accès aux données. Deux implémentations : MemoryStore (tests, développement) et SupabaseStore (production).
 * Les méthodes « Atomic » ou renvoyant `null` sur conflit garantissent l'absence de course.
 */
export interface Store {
  // Organisations
  createOrganization(input: { name: string }): Promise<OrganizationRow>;
  getOrganization(id: string): Promise<OrganizationRow | null>;
  updateOrganization(id: string, patch: Partial<OrganizationRow>): Promise<OrganizationRow>;
  listOrganizations(opts?: { limit?: number; offset?: number }): Promise<OrganizationRow[]>;
  findOrganizationByStripeCustomer(customerId: string): Promise<OrganizationRow | null>;

  // Membres
  addMembership(row: Omit<MembershipRow, 'created_at'>): Promise<MembershipRow>;
  getMembership(orgId: string, userId: string): Promise<MembershipRow | null>;
  listMembershipsForUser(userId: string): Promise<MembershipRow[]>;
  listMembers(orgId: string): Promise<MembershipRow[]>;
  updateMembershipRole(orgId: string, userId: string, role: MembershipRow['role']): Promise<void>;
  removeMembership(orgId: string, userId: string): Promise<void>;

  // Invitations
  createInvitation(row: Omit<InvitationRow, 'id' | 'created_at' | 'accepted_at'>): Promise<InvitationRow>;
  getInvitationByTokenHash(hash: string): Promise<InvitationRow | null>;
  markInvitationAccepted(id: string): Promise<void>;
  listInvitations(orgId: string): Promise<InvitationRow[]>;
  deleteInvitation(orgId: string, id: string): Promise<void>;

  // Connexions bancaires
  createBankConnection(row: Omit<BankConnectionRow, 'id' | 'created_at' | 'last_sync_at' | 'status'>): Promise<BankConnectionRow>;
  getBankConnection(id: string): Promise<BankConnectionRow | null>;
  listBankConnections(orgId: string): Promise<BankConnectionRow[]>;
  listAllBankConnections(): Promise<BankConnectionRow[]>;
  updateBankConnection(id: string, patch: Partial<BankConnectionRow>): Promise<void>;
  deleteBankConnection(id: string): Promise<void>;

  // Agents et politiques
  createAgent(row: Omit<AgentRow, 'id' | 'created_at' | 'last_used_at' | 'status'>): Promise<AgentRow>;
  getAgent(id: string): Promise<AgentRow | null>;
  getAgentByTokenHash(hash: string): Promise<AgentRow | null>;
  listAgents(orgId: string): Promise<AgentRow[]>;
  updateAgent(id: string, patch: Partial<AgentRow>): Promise<AgentRow>;
  deleteAgent(id: string): Promise<void>;
  getPolicy(agentId: string): Promise<PolicyRow | null>;
  upsertPolicy(row: Omit<PolicyRow, 'updated_at'>): Promise<PolicyRow>;

  // Demandes
  /** Insère la demande si le cumul du mois (pending/approved/issued/completed) + montant ≤ budget ; sinon lève ArtemisError('over_monthly_budget'). */
  createCardRequestAtomic(input: NewCardRequest, budgetCents: number, monthStart: Date): Promise<CardRequestRow>;
  getCardRequest(id: string): Promise<CardRequestRow | null>;
  /** Met à jour ; si `expectedStatus` est fourni et différent du statut courant, ne fait rien et renvoie null. */
  updateCardRequest(id: string, patch: Partial<CardRequestRow>, expectedStatus?: RequestStatus): Promise<CardRequestRow | null>;
  listCardRequests(orgId: string, filter?: { status?: RequestStatus; agentId?: string; limit?: number; from?: Date; to?: Date }): Promise<CardRequestRow[]>;
  listExpiredPendingRequests(now: Date): Promise<CardRequestRow[]>;
  /** Somme des demandes pending/approved/issued/completed de l'agent depuis `from`. */
  sumCommitted(agentId: string, from: Date): Promise<number>;
  countRequestsSince(from: Date): Promise<number>;

  // Mandats
  createMandate(row: MandateRow): Promise<MandateRow>;
  getMandate(requestId: string): Promise<MandateRow | null>;

  // Cartes
  createCard(row: Omit<CardRow, 'id' | 'created_at' | 'revealed_at'>): Promise<CardRow>;
  getCard(id: string): Promise<CardRow | null>;
  getCardByRequest(requestId: string): Promise<CardRow | null>;
  getCardByProviderId(bankConnectionId: string, providerCardId: string): Promise<CardRow | null>;
  /** Pose revealed_at si elle est vide ; renvoie null si la carte était déjà révélée. */
  markCardRevealed(cardId: string): Promise<CardRow | null>;
  updateCard(id: string, patch: Partial<CardRow>): Promise<CardRow>;
  listCards(orgId: string, filter?: { status?: CardRow['status']; limit?: number }): Promise<CardRow[]>;
  listExpiredActiveCards(now: Date): Promise<CardRow[]>;

  // Transactions
  /** Insère ou met à jour par (bank_connection_id, provider_tx_id). */
  upsertTransaction(row: Omit<TransactionRow, 'id' | 'created_at' | 'match_status'> & { match_status?: TransactionRow['match_status'] }): Promise<TransactionRow>;
  updateTransaction(id: string, patch: Partial<TransactionRow>): Promise<void>;
  listTransactions(orgId: string, filter?: { from?: Date; to?: Date; limit?: number }): Promise<TransactionRow[]>;

  // Justificatifs
  createReceipt(row: Omit<ReceiptRow, 'id' | 'created_at'>): Promise<ReceiptRow>;
  getReceipt(id: string): Promise<ReceiptRow | null>;
  listReceipts(orgId: string, requestId?: string): Promise<ReceiptRow[]>;
  putFile(path: string, body: ArrayBuffer, contentType: string): Promise<void>;
  getFile(path: string): Promise<{ body: ArrayBuffer; contentType: string } | null>;

  // Audit
  appendAudit(input: AuditInput): Promise<AuditRow>;
  listAudit(orgId: string, opts?: { limit?: number; beforeId?: number }): Promise<AuditRow[]>;
  /** Toutes les entrées, par id croissant (vérification et export). */
  listAllAudit(orgId: string): Promise<AuditRow[]>;

  // Passkeys et notifications
  listPasskeys(userId: string): Promise<PasskeyRow[]>;
  getPasskeyByCredentialId(credentialId: string): Promise<PasskeyRow | null>;
  savePasskey(row: Omit<PasskeyRow, 'id' | 'created_at'>): Promise<PasskeyRow>;
  updatePasskeyCounter(id: string, counter: number): Promise<void>;
  deletePasskey(userId: string, id: string): Promise<void>;
  listPushSubscriptions(userIds: string[]): Promise<PushSubscriptionRow[]>;
  savePushSubscription(row: Omit<PushSubscriptionRow, 'id' | 'created_at'>): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;

  // Usage, liste d'attente, technique
  incrementUsage(orgId: string, period: string): Promise<number>;
  getUsage(orgId: string, period: string): Promise<number>;
  incrementOverage(orgId: string, period: string): Promise<number>;
  getOverage(orgId: string, period: string): Promise<number>;
  waitlistAdd(row: { email: string; company?: string | null; use_case?: string | null }): Promise<void>;
  listWaitlist(limit: number): Promise<WaitlistRow[]>;
  countWaitlist(): Promise<number>;
  /** true si la requête est autorisée dans la fenêtre. */
  hitRateLimit(key: string, windowSec: number, max: number): Promise<boolean>;
  kvSet(key: string, value: unknown, ttlSec: number): Promise<void>;
  /** Lit et supprime la valeur (usage unique). */
  kvTake<T>(key: string): Promise<T | null>;
}
