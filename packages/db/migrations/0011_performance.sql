-- Performance (recommandations Supabase) : index sur les clés étrangères et auth.uid() évalué une fois par requête.
create index if not exists agents_bank_connection_idx on agents(bank_connection_id);
create index if not exists agents_client_idx on agents(client_id);
create index if not exists approvals_org_idx on approvals(org_id);
create index if not exists cards_bank_connection_idx on cards(bank_connection_id);
create index if not exists invitations_org_idx on invitations(org_id);
create index if not exists mandates_org_idx on mandates(org_id);
create index if not exists passkeys_user_idx on passkeys(user_id);
create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);
create index if not exists receipts_org_idx on receipts(org_id);
create index if not exists receipts_request_idx on receipts(request_id);
create index if not exists transactions_card_idx on transactions(card_id);

alter policy passkeys_own on passkeys using (user_id = (select auth.uid()));
alter policy push_own on push_subscriptions using (user_id = (select auth.uid()));
