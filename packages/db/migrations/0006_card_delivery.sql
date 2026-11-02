-- V2 : mode de remise de la carte. Par défaut, le numéro ne transite jamais par Artemis (lien éphémère émetteur).
alter table organizations add column if not exists card_delivery text not null default 'issuer_link'
  check (card_delivery in ('issuer_link', 'direct'));
