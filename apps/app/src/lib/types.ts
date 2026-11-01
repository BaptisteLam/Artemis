import type {
  AgentRow,
  AuditRow,
  BankConnectionRow,
  CardRequestRow,
  CardRow,
  MandateRow,
  MembershipRow,
  OrganizationRow,
  PolicyRow,
  ReceiptRow,
  TransactionRow,
} from '@artemis/db';
import type { Plan, PlanLimits } from '@artemis/shared';

export type Role = MembershipRow['role'];
export type { AuditRow, CardRequestRow, CardRow, MandateRow, MembershipRow, OrganizationRow, PolicyRow, ReceiptRow, TransactionRow };
export type PublicAgent = Omit<AgentRow, 'token_hash'>;
export type PublicConnection = Omit<BankConnectionRow, 'credentials_ciphertext'>;

export interface Me {
  user: { id: string; email: string; isAdmin: boolean };
  organizations: { role: Role; organization: OrganizationRow }[];
}

export interface OrgInfo {
  organization: OrganizationRow;
  role: Role;
  effective_plan: Plan;
  limits: PlanLimits;
  usage: { period: string; requests: number };
}

export interface Budget {
  period: string;
  currency: string;
  monthly_budget: number;
  spent: number;
  remaining: number;
  per_transaction_limit: number;
}

export type AgentWithBudget = PublicAgent & { budget: Budget };
export type RequestWithAgent = CardRequestRow & { agent_name: string | null };

export interface RequestDetail {
  request: CardRequestRow;
  agent: { id: string; name: string; platform: string } | null;
  policy: PolicyRow | null;
  mandate: MandateRow | null;
  card: CardRow | null;
  receipts: ReceiptRow[];
  transactions: TransactionRow[];
}

export interface Dashboard {
  period: string;
  plan: Plan;
  frozen: boolean;
  spent_this_month: number;
  pending_count: number;
  requests_this_month: number;
  by_agent: { id: string; name: string; status: string; spent: number }[];
  recent_requests: RequestWithAgent[];
  recent_transactions: TransactionRow[];
}
