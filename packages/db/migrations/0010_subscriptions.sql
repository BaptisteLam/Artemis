-- V2 : abonnements récurrents gérés par agent (carte verrouillée sur le marchand, plafond mensuel).
alter table card_requests add column if not exists recurring_interval text check (recurring_interval is null or recurring_interval in ('month'));
alter table cards add column if not exists recurring boolean not null default false;

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
  insert into card_requests(org_id, agent_id, client_id, amount_cents, currency, merchant, mcc, purpose, card_ttl_minutes, recurring_interval, status, decision_reason, expires_at)
  values (
    (p->>'org_id')::uuid, v_agent, v_client, v_amount, p->>'currency', p->>'merchant', p->>'mcc', p->>'purpose',
    nullif(p->>'card_ttl_minutes', '')::int, nullif(p->>'recurring_interval', ''),
    coalesce((p->>'status')::request_status, 'pending'), p->>'decision_reason',
    (p->>'expires_at')::timestamptz
  )
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function create_card_request(jsonb, bigint, timestamptz, bigint) from public, anon, authenticated;
grant execute on function create_card_request(jsonb, bigint, timestamptz, bigint) to service_role;
