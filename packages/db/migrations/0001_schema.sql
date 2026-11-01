-- Artemis — schéma principal. Aucun numéro de carte complet ni CVC n'est jamais stocké.

create type plan as enum ('sandbox', 'builder', 'team', 'business');
create type member_role as enum ('owner', 'admin', 'approver', 'viewer');
create type request_status as enum ('pending', 'approved', 'rejected', 'expired', 'issued', 'failed', 'canceled', 'completed');
create type card_status as enum ('active', 'pending_bank_sca', 'used', 'canceled', 'expired');
create type match_status as enum ('matched', 'mismatch', 'unmatched');
create type bank_provider as enum ('sandbox', 'stripe', 'qonto', 'revolut');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  plan plan not null default 'sandbox',
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text,
  frozen_at timestamptz,
  created_at timestamptz not null default now()
);

create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role member_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role member_role not null,
  token_hash text not null unique,
  invited_by uuid,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table bank_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider bank_provider not null,
  label text not null,
  credentials_ciphertext text not null,
  status text not null default 'active',
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);
create index bank_connections_org_idx on bank_connections(org_id);

create table agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  platform text not null default 'other',
  token_hash text not null unique,
  token_prefix text not null,
  bank_connection_id uuid references bank_connections(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'frozen')),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index agents_org_idx on agents(org_id);

create table policies (
  agent_id uuid primary key references agents(id) on delete cascade,
  monthly_budget_cents bigint not null default 50000 check (monthly_budget_cents >= 0),
  per_tx_limit_cents bigint not null default 10000 check (per_tx_limit_cents >= 0),
  currencies text[] not null default '{EUR}',
  merchant_allow text[] not null default '{}',
  merchant_deny text[] not null default '{}',
  mcc_allow text[] not null default '{}',
  mcc_deny text[] not null default '{}',
  auto_approve_below_cents bigint not null default 0,
  card_ttl_minutes int not null default 30 check (card_ttl_minutes between 5 and 10080),
  request_ttl_minutes int not null default 30 check (request_ttl_minutes between 5 and 10080),
  freeze_on_mismatch boolean not null default false,
  updated_at timestamptz not null default now()
);

create table card_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null,
  merchant text not null,
  mcc text,
  purpose text not null,
  card_ttl_minutes int,
  status request_status not null default 'pending',
  decision_reason text,
  decided_by uuid,
  decided_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index card_requests_org_idx on card_requests(org_id, created_at desc);
create index card_requests_agent_idx on card_requests(agent_id, created_at desc);
create index card_requests_pending_idx on card_requests(status, expires_at) where status = 'pending';

create table mandates (
  request_id uuid primary key references card_requests(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  payload jsonb not null,
  payload_hash text not null,
  signed_by uuid,
  passkey_id text,
  signature text,
  authenticator_data text,
  client_data_json text,
  auto_approved boolean not null default false,
  signed_at timestamptz not null default now()
);

create table cards (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references card_requests(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  bank_connection_id uuid references bank_connections(id) on delete set null,
  provider_card_id text not null,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  exp_month int not null,
  exp_year int not null,
  status card_status not null default 'active',
  revealed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index cards_org_idx on cards(org_id, created_at desc);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  card_id uuid references cards(id) on delete set null,
  provider_tx_id text not null,
  bank_connection_id uuid references bank_connections(id) on delete set null,
  amount_cents bigint not null,
  currency text not null,
  merchant_name text not null,
  mcc text,
  status text not null,
  occurred_at timestamptz not null,
  match_status match_status not null default 'unmatched',
  created_at timestamptz not null default now(),
  unique (bank_connection_id, provider_tx_id)
);
create index transactions_org_idx on transactions(org_id, occurred_at desc);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  request_id uuid not null references card_requests(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  content_type text not null,
  size_bytes int not null,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'agent', 'system')),
  actor_id text not null,
  action text not null,
  subject text not null,
  data jsonb not null default '{}',
  prev_hash text,
  hash text not null,
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on audit_log(org_id, id);

create table passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  name text,
  created_at timestamptz not null default now()
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table usage_counters (
  org_id uuid not null references organizations(id) on delete cascade,
  period text not null,
  requests int not null default 0,
  primary key (org_id, period)
);

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  company text,
  use_case text,
  created_at timestamptz not null default now()
);

-- Clé/valeur technique : challenges WebAuthn, limites de débit.
create table kv (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz not null
);
