-- V2 : quorum d'approbateurs et notifications Slack.
alter table policies add column if not exists approvals_required int not null default 1 check (approvals_required between 1 and 3);
alter table policies add column if not exists quorum_above_cents bigint check (quorum_above_cents is null or quorum_above_cents >= 0);
alter table organizations add column if not exists slack_webhook_ciphertext text;

create table if not exists approvals (
  request_id uuid not null references card_requests(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  passkey_id text not null,
  payload_hash text not null,
  signature text not null,
  authenticator_data text not null,
  client_data_json text not null,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);
alter table approvals enable row level security;
create policy approvals_read on approvals for select to authenticated using (is_member(org_id));
grant select on approvals to authenticated;
grant all on approvals to service_role;
