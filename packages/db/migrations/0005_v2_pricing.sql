-- V2 : plan Agences et dépassements facturés à l'usage.
alter type plan add value if not exists 'agency' before 'business';

alter table usage_counters add column if not exists overage int not null default 0;

create or replace function increment_overage(p_org uuid, p_period text) returns int language sql set search_path = public as $$
  insert into usage_counters(org_id, period, requests, overage) values (p_org, p_period, 0, 1)
  on conflict (org_id, period) do update set overage = usage_counters.overage + 1
  returning overage
$$;
revoke execute on function increment_overage(uuid, text) from public, anon, authenticated;
grant execute on function increment_overage(uuid, text) to service_role;
