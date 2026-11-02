# Journal V2 — plan : docs/superpowers/plans/2026-11-02-artemis-v2.md
Relance horaire : tâche planifiée « Relance build Artemis V2 ».
Task 1: complete (docs : benchmark, spec V2, README, déploiement, plan)
Task 2: complete (grille V2, dépassement, migration 0005 — à appliquer sur Supabase en Task 10)
Task 3: complete (lien éphémère, migration 0006, e2e mis à jour)
Task 4: complete (mode agence, migration 0007)
Task 5: complete (garde-fous, migration 0008)
Task 6: complete (CLI, skill, n8n — publication npm à faire par Baptiste)
Task 7: complete (quorum, Slack, migration 0009)
Task 8: complete (abonnements, dossier AI Act, migration 0010)
Task 9: complete (proposition de valeur V2, page Agences)
Task 10: partiel — build, tests, e2e verts ; migrations 0005 à 0010 appliquées sur Supabase, schéma hébergé identique au dépôt (colonnes, RLS, index vérifiés), create_card_request testée en production (transaction annulée) ; déploiement Cloudflare automatisé (workflow GitHub « Déploiement Cloudflare », secrets générés une fois) — attend CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID et SUPABASE_SERVICE_ROLE_KEY dans les secrets GitHub
À faire après le premier déploiement : URL Supabase Auth (Site URL + Redirect URLs), adresses par défaut du CLI et du nœud n8n (packages/cli/src/commands.ts, integrations/n8n-nodes-artemis) une fois le domaine connu
