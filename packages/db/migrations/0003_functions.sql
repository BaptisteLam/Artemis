-- Fonctions transactionnelles appelées par l'API (service_role).

-- Journal d'audit en insertion seule.
create or replace function audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- Ajoute une entrée chaînée. Le JSON canonique de l'entrée est calculé par l'API et passé dans data->>'_canonical'.
create or replace function append_audit(
  p_org uuid, p_actor_type text, p_actor_id text, p_action text, p_subject text, p_data jsonb
) returns audit_log language plpgsql as $$
declare
  v_prev text;
  v_canonical text := coalesce(p_data->>'_canonical', '');
  v_row audit_log;
begin
  perform pg_advisory_xact_lock(hashtext(p_org::text));
  select hash into v_prev from audit_log where org_id = p_org order by id desc limit 1;
  insert into audit_log(org_id, actor_type, actor_id, action, subject, data, prev_hash, hash)
  values (
    p_org, p_actor_type, p_actor_id, p_action, p_subject, p_data - '_canonical', v_prev,
    encode(sha256(convert_to(coalesce(v_prev, '') || v_canonical, 'UTF8')), 'hex')
  )
  returning * into v_row;
  return v_row;
end $$;

-- Crée une demande en vérifiant atomiquement le budget mensuel de l'agent.
create or replace function create_card_request(p jsonb, p_budget_cents bigint, p_month_start timestamptz)
returns card_requests language plpgsql as $$
declare
  v_agent uuid := (p->>'agent_id')::uuid;
  v_amount bigint := (p->>'amount_cents')::bigint;
  v_spent bigint;
  v_row card_requests;
begin
  perform 1 from agents where id = v_agent for update;
  select coalesce(sum(amount_cents), 0) into v_spent from card_requests
    where agent_id = v_agent and created_at >= p_month_start
      and status in ('pending', 'approved', 'issued', 'completed');
  if v_spent + v_amount > p_budget_cents then
    raise exception 'over_monthly_budget' using errcode = 'P0001';
  end if;
  insert into card_requests(org_id, agent_id, amount_cents, currency, merchant, mcc, purpose, card_ttl_minutes, status, decision_reason, expires_at)
  values (
    (p->>'org_id')::uuid, v_agent, v_amount, p->>'currency', p->>'merchant', p->>'mcc', p->>'purpose',
    nullif(p->>'card_ttl_minutes', '')::int,
    coalesce((p->>'status')::request_status, 'pending'), p->>'decision_reason',
    (p->>'expires_at')::timestamptz
  )
  returning * into v_row;
  return v_row;
end $$;

-- Marque une carte comme révélée ; ne renvoie rien si elle l'était déjà.
create or replace function mark_card_revealed(p_card uuid) returns setof cards language sql as $$
  update cards set revealed_at = now() where id = p_card and revealed_at is null returning *
$$;

create or replace function increment_usage(p_org uuid, p_period text) returns int language sql as $$
  insert into usage_counters(org_id, period, requests) values (p_org, p_period, 1)
  on conflict (org_id, period) do update set requests = usage_counters.requests + 1
  returning requests
$$;

-- Limite de débit à fenêtre fixe ; renvoie true si la requête est autorisée.
create or replace function hit_rate_limit(p_key text, p_window_sec int, p_max int) returns boolean language plpgsql as $$
declare
  v_count int;
begin
  insert into kv(key, value, expires_at) values (p_key, '1'::jsonb, now() + make_interval(secs => p_window_sec))
  on conflict (key) do update set
    value = case when kv.expires_at < now() then '1'::jsonb else to_jsonb((kv.value)::text::int + 1) end,
    expires_at = case when kv.expires_at < now() then now() + make_interval(secs => p_window_sec) else kv.expires_at end
  returning (value)::text::int into v_count;
  return v_count <= p_max;
end $$;

-- Nettoyage périodique.
create or replace function purge_kv() returns void language sql as $$
  delete from kv where expires_at < now()
$$;
