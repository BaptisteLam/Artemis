-- V2 : mode agence. Un client regroupe des agents ; budget mensuel et marge de refacturation par client.
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  billing_email text,
  markup_pct numeric(5,2) not null default 0 check (markup_pct between 0 and 200),
  monthly_budget_cents bigint check (monthly_budget_cents is null or monthly_budget_cents >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists clients_org_idx on clients(org_id);
alter table clients enable row level security;
create policy clients_read on clients for select to authenticated using (is_member(org_id));
grant select on clients to authenticated;
grant all on clients to service_role;

alter table agents add column if not exists client_id uuid references clients(id) on delete set null;
alter table card_requests add column if not exists client_id uuid references clients(id) on delete set null;
create index if not exists card_requests_client_idx on card_requests(client_id, created_at desc);

-- Budget agent ET budget client vérifiés atomiquement.
drop function if exists create_card_request(jsonb, bigint, timestamptz);
create or replace function create_card_request(p jsonb, p_budget_cents bigint, p_month_start timestamptz, p_client_budget_cents bigint default null)
returns card_requests language plpgsql set search_path = public as $$
declare
  v_agent uuid := (p->>'agent_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_amount bigint := (p->>'amount_cents')::bigint;
  v_spent bigint;
  v_row card_requests;
begin
  perform 1 from agents where id = v_agent for update;
  select coalesce(sum(amount_cents), 0) into v_spent from card_requests
    where agent_id = v_agent and created_at >= p_month_start and status in ('pending', 'approved', 'issued', 'completed');
  if v_spent + v_amount > p_budget_cents then
    raise exception 'over_monthly_budget' using errcode = 'P0001';
  end if;
  if v_client is not null and p_client_budget_cents is not null then
    perform 1 from clients where id = v_client for update;
    select coalesce(sum(amount_cents), 0) into v_spent from card_requests
      where client_id = v_client and created_at >= p_month_start and status in ('pending', 'approved', 'issued', 'completed');
    if v_spent + v_amount > p_client_budget_cents then
      raise exception 'over_client_budget' using errcode = 'P0001';
    end if;
  end if;
  insert into card_requests(org_id, agent_id, client_id, amount_cents, currency, merchant, mcc, purpose, card_ttl_minutes, status, decision_reason, expires_at)
  values (
    (p->>'org_id')::uuid, v_agent, v_client, v_amount, p->>'currency', p->>'merchant', p->>'mcc', p->>'purpose',
    nullif(p->>'card_ttl_minutes', '')::int,
    coalesce((p->>'status')::request_status, 'pending'), p->>'decision_reason',
    (p->>'expires_at')::timestamptz
  )
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function create_card_request(jsonb, bigint, timestamptz, bigint) from public, anon, authenticated;
grant execute on function create_card_request(jsonb, bigint, timestamptz, bigint) to service_role;
