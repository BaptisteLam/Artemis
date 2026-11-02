-- Langue de l'utilisateur (emails, notifications push et Slack dans sa langue). Code ISO 639-1 d'une des 24 langues de l'UE.
alter table memberships add column if not exists locale text check (locale is null or locale ~ '^[a-z]{2}$');
