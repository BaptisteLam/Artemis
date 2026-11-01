-- Durcissement : search_path figé et fonctions RPC réservées au service_role (l'API).

alter function is_member(uuid, member_role[]) set search_path = public;
alter function audit_log_immutable() set search_path = public;
alter function append_audit(uuid, text, text, text, text, jsonb) set search_path = public;
alter function create_card_request(jsonb, bigint, timestamptz) set search_path = public;
alter function mark_card_revealed(uuid) set search_path = public;
alter function increment_usage(uuid, text) set search_path = public;
alter function hit_rate_limit(text, integer, integer) set search_path = public;
alter function purge_kv() set search_path = public;

revoke execute on function append_audit(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function create_card_request(jsonb, bigint, timestamptz) from public, anon, authenticated;
revoke execute on function mark_card_revealed(uuid) from public, anon, authenticated;
revoke execute on function increment_usage(uuid, text) from public, anon, authenticated;
revoke execute on function hit_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function purge_kv() from public, anon, authenticated;
revoke execute on function audit_log_immutable() from public, anon, authenticated;

grant execute on function append_audit(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function create_card_request(jsonb, bigint, timestamptz) to service_role;
grant execute on function mark_card_revealed(uuid) to service_role;
grant execute on function increment_usage(uuid, text) to service_role;
grant execute on function hit_rate_limit(text, integer, integer) to service_role;
grant execute on function purge_kv() to service_role;

-- is_member sert aux politiques RLS des membres connectés uniquement.
revoke execute on function is_member(uuid, member_role[]) from public, anon;
grant execute on function is_member(uuid, member_role[]) to authenticated, service_role;

-- Par défaut, les nouvelles fonctions ne sont pas exécutables publiquement.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
