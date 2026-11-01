-- RLS : défense en profondeur. L'API utilise service_role ; l'accès direct n'expose que l'organisation du membre.

create or replace function is_member(org uuid, roles member_role[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = org and m.user_id = auth.uid()
      and (roles is null or m.role = any(roles))
  )
$$;

alter table organizations enable row level security;
alter table memberships enable row level security;
alter table invitations enable row level security;
alter table bank_connections enable row level security;
alter table agents enable row level security;
alter table policies enable row level security;
alter table card_requests enable row level security;
alter table mandates enable row level security;
alter table cards enable row level security;
alter table transactions enable row level security;
alter table receipts enable row level security;
alter table audit_log enable row level security;
alter table passkeys enable row level security;
alter table push_subscriptions enable row level security;
alter table usage_counters enable row level security;
alter table waitlist enable row level security;
alter table kv enable row level security;

create policy org_read on organizations for select to authenticated using (is_member(id));
create policy membership_read on memberships for select to authenticated using (is_member(org_id));
create policy agents_read on agents for select to authenticated using (is_member(org_id));
create policy policies_read on policies for select to authenticated
  using (exists (select 1 from agents a where a.id = agent_id and is_member(a.org_id)));
create policy requests_read on card_requests for select to authenticated using (is_member(org_id));
create policy mandates_read on mandates for select to authenticated using (is_member(org_id));
create policy cards_read on cards for select to authenticated using (is_member(org_id));
create policy tx_read on transactions for select to authenticated using (is_member(org_id));
create policy receipts_read on receipts for select to authenticated using (is_member(org_id));
create policy audit_read on audit_log for select to authenticated using (is_member(org_id));
create policy passkeys_own on passkeys for select to authenticated using (user_id = auth.uid());
create policy push_own on push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy usage_read on usage_counters for select to authenticated using (is_member(org_id));
-- bank_connections, invitations, waitlist, kv : aucun accès direct (identifiants chiffrés, données internes).

grant usage on schema public to authenticated, anon, service_role;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
revoke select on bank_connections, invitations, waitlist, kv from authenticated;
