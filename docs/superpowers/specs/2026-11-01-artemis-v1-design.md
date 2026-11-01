# Artemis V1 — Spécification de conception

- **Date** : 1er novembre 2026
- **Auteur** : Baptiste (fondateur), avec Claude Code
- **Statut** : en revue
- **Documents sources** : « Artemis — Étude de marché », « Artemis — Plan de lancement », design system « Lucent » (artefact), logo Artemis.

---

## 1. Résumé

Artemis donne aux agents IA d'une entreprise (Claude, ChatGPT, n8n, scripts) le pouvoir de payer avec une **carte virtuelle à usage unique**, créée **dans la banque professionnelle du client** (Qonto, Revolut Business, Stripe Issuing), après **validation humaine signée** (passkey, et authentification forte de la banque quand elle l'exige).

Signature : **« Vos agents paient. Vous gardez le dernier mot. »**

Artemis est un **logiciel de gouvernance des dépenses d'agents**. Il ne détient, ne transfère et n'émet jamais d'argent.

## 2. Ce qui change par rapport au plan de lancement (et pourquoi)

| Sujet | Plan de lancement | V1 retenue | Raison |
|---|---|---|---|
| Émission des cartes | Artemis program manager de Swan / Stripe Issuing | La **banque du client** émet ; Artemis pilote via API | Activité régulée incompatible avec une micro-entreprise ; Swan 2 990 €/mois ; 0,10 €/carte |
| Structure juridique | SAS + avis ACPR dès M1 | **Micro-entreprise existante** du fondateur, éditeur SaaS | Budget fondateur 10–30 € ; Artemis ne manipule pas de fonds |
| Revenus | Abonnement + commission/carte + interchange | **Abonnement uniquement** | Pas d'interchange sans être émetteur ; les coûts variables (cartes) sont portés par la banque du client |
| Validation humaine | SCA de l'émetteur (Swan `consentUrl`) | **Passkey WebAuthn** signant le mandat + SCA bancaire si la banque l'impose (Qonto) | Fonctionne pour tous les connecteurs, gratuit |
| Hébergement | Vercel / Scaleway / Fly | **Cloudflare Pages + Workers**, **Supabase UE** | Offres gratuites autorisant l'usage commercial, sans mise en veille côté API |
| Framework | Next.js | **Astro** (site) + **React/Vite** (app) + **Hono** (API/MCP) | Compatible offre gratuite Cloudflare, plus léger |
| Financement | Pré-seed 0,8–1,2 M€ | **Bootstrap** ; levée éventuelle avec traction | Contrainte fondateur |

### 2.1 Défis assumés

- **Perte de l'interchange** : le revenu repose entièrement sur l'abonnement. Les prix sont fixés en conséquence (voir §4).
- **Dépendance aux API bancaires** : Qonto (création de carte avec SCA, API partenaire OAuth) et Revolut Business (`POST /cards`, accès Cards à demander au support, plans payants) doivent ouvrir l'accès. Démarche gratuite à faire par le fondateur. En attendant : connecteur **Sandbox** pleinement fonctionnel.
- **Clients sans Qonto / Revolut / Stripe** : servis par la Sandbox (démo, développement) ; d'autres connecteurs (Swan, Wise, etc.) en V2 selon demande.
- **Remise des identifiants à l'agent** : le numéro complet transite par Artemis (relayé, jamais stocké). Risque borné par la carte (usage unique, montant exact, expiration courte). Cela peut faire entrer Artemis dans le périmètre PCI DSS (SAQ D service provider) : à évaluer avant la mise en production réelle ; alternative V2 : révélation via les composants PCI de la banque.
- **Vérification CGU** : l'usage des API Qonto / Revolut par une application tierce doit être confirmé (programme partenaires Qonto). Point bloquant pour l'activation réelle, pas pour le développement.

## 3. Utilisateurs et rôles

- **Builders** (freelances, devs Claude Code / n8n), **studios IA**, **startups et PME**.
- Rôles dans une organisation :

| Rôle | Peut |
|---|---|
| `owner` | Tout, dont facturation, connexion bancaire, suppression |
| `admin` | Agents, règles, membres, connexions |
| `approver` | Valider / refuser les demandes |
| `viewer` | Lire transactions, exports, audit |

- **Super-admin** (le fondateur) : back-office global, défini par une liste d'emails dans les secrets.

## 4. Offres

| Plan | Prix | Quotas |
|---|---|---|
| Sandbox | 0 € | Banque simulée uniquement, 1 agent, 50 demandes/mois |
| Builder | 19 €/mois | 3 agents, 1 banque connectée, 100 demandes/mois, export CSV |
| Team | 49 €/mois | 15 agents, 2 banques, 1 000 demandes/mois, multi-approbateurs, export FEC |
| Business | 149 €/mois | Illimité (usage raisonnable), journal AI Act exportable, accès API REST |

- Paiement par Stripe Checkout, gestion via le portail client Stripe. Facturation annuelle −2 mois (option).
- Mentions micro-entreprise sur les factures : « TVA non applicable, art. 293 B du CGI ». Surveillance du seuil de franchise TVA et du plafond de chiffre d'affaires (77 700 € en prestations de services).
- Quotas appliqués côté API (refus `quota_exceeded`).

## 5. Périmètre fonctionnel V1

### 5.1 Site marketing (`apps/site`)

Pages : accueil, fonctionnement, tarifs, sécurité & conformité, docs (démarrage, MCP Claude / ChatGPT / n8n, API, règles), mentions légales, CGU/CGV, confidentialité, liste d'attente (formulaire → table `waitlist`). FR d'abord ; structure i18n prête pour l'EN.

### 5.2 App client (`apps/app`)

1. **Authentification** : email + lien magique (Supabase Auth), puis enrôlement d'une passkey (obligatoire pour approuver).
2. **Onboarding** : créer l'organisation, choisir la banque (Sandbox par défaut), créer le premier agent, copier la config MCP.
3. **Agents** : créer (nom, plateforme : claude / chatgpt / n8n / api / autre), générer un jeton `art_…` (affiché une fois), régénérer, geler, supprimer.
4. **Règles** (une politique par agent) : budget mensuel, plafond par transaction, devises autorisées, marchands autorisés / interdits (correspondance insensible à la casse), catégories (MCC) autorisées / interdites, seuil d'auto-validation, durée de vie d'une carte (défaut 30 min, max 7 j), délai d'expiration d'une demande (défaut 30 min).
5. **Demandes** : liste filtrable ; écran mandat (agent, montant, devise, marchand, intention, règles appliquées) ; Approuver (passkey) / Refuser (motif).
6. **Cartes & transactions** : cartes émises (last4, statut, expiration), transactions synchronisées, rapprochement, alertes d'écart, justificatifs (upload).
7. **Exports** : CSV et FEC (compatibles Pennylane) par période.
8. **Équipe** : invitations par email, rôles.
9. **Connexions bancaires** : ajouter / tester / supprimer (Sandbox, Qonto, Revolut, Stripe Issuing).
10. **Audit** : journal chaîné, vérification d'intégrité, export JSON signé (preuve de supervision humaine AI Act).
11. **Facturation** : plan actuel, quotas consommés, bouton Stripe Checkout / portail.
12. **Notifications** : Web Push (PWA installable) + email (Resend) pour chaque demande en attente.
13. **Bouton d'urgence** : « Tout geler » (agents gelés, cartes actives annulées).

### 5.3 Back-office super-admin (dans `apps/app`, route `/admin`)

Organisations, plans, statut d'abonnement, MRR estimé, inscriptions récentes, liste d'attente, usage (demandes/mois).

### 5.4 API et MCP (`apps/api`)

**Serveur MCP** (HTTP streamable, `POST /mcp`, auth `Authorization: Bearer art_…`) :

| Outil | Entrée | Sortie |
|---|---|---|
| `request_card` | `amount` (centimes), `currency`, `merchant`, `purpose`, `mcc?`, `expires_in?` | `{ request_id, status }` (`approved`, `pending_approval`, `rejected` + motif) |
| `get_request_status` | `request_id` | statut, `card_id?` |
| `get_card_for_checkout` | `request_id` | `{ number, exp_month, exp_year, cvc, cardholder_name, expires_at }` **une seule fois** |
| `list_budgets` | — | budget mensuel, dépensé, restant, plafond |
| `get_spend_summary` | `period` (`month`, `week`, `day`) | totaux par marchand |
| `attach_receipt` | `request_id`, `url` ou `content_base64` + `filename` | `{ receipt_id }` |
| `cancel_card` | `request_id` | `{ status: "canceled" }` |

**API REST** (`/v1/…`, même jeton) : mêmes opérations pour n8n, Make et scripts. Spécification OpenAPI générée.

**Webhooks entrants** : Stripe Billing (abonnements), Stripe Issuing (transactions), Qonto / Revolut si disponibles.

**Tâches planifiées** (Cron Worker, toutes les 5 min) : expirer les demandes, fermer les cartes expirées non utilisées, synchroniser les transactions, rapprocher, signaler les écarts.

### 5.5 Distribution

- Config MCP prête à copier (Claude Desktop / Claude Code / ChatGPT connecteurs / n8n MCP client).
- Workflow n8n d'exemple (`examples/n8n/`).
- Fiche pour annuaires MCP (README dédié).

### 5.6 Hors V1

OCR des justificatifs, SSO, sous-organisations clients, app native, mandats AP2, KYA, micro-paiements stablecoin, assurance « achat d'agent », intégration API Pennylane / Qonto Connect comptable (les exports CSV/FEC couvrent le besoin V1), EN complet.

## 6. Architecture

```
Agent IA ──MCP / REST──▶ apps/api (Cloudflare Worker, Hono)
                           │  ├─ auth agent (hash jeton)
                           │  ├─ packages/policy (moteur de règles, pur)
                           │  ├─ packages/connectors (Sandbox | Qonto | Revolut | Stripe)
                           │  ├─ audit chaîné
                           │  └─ notifications (Web Push, Resend)
                           ▼
                     Supabase (Postgres UE + Auth + Storage, RLS)
                           ▲
Humain ──▶ apps/app (React/Vite PWA, Cloudflare Pages) ──▶ Supabase (lecture RLS) + apps/api (actions sensibles)
Visiteur ──▶ apps/site (Astro, Cloudflare Pages)
```

### 6.1 Monorepo

```
apps/site          Astro, site marketing + docs
apps/app           React + Vite + React Router, PWA (service worker, manifest)
apps/api           Hono sur Cloudflare Workers : /v1, /mcp, /webhooks, /app (actions de l'app), cron
packages/ui        Tokens Artemis (CSS), composants React (Button, Glass, Window, Amount, Badge, Field…)
packages/db        Migrations SQL Supabase, types générés, client typé
packages/policy    Moteur de règles (fonctions pures)
packages/connectors Interface BankConnector + implémentations
packages/shared    Schémas Zod, types, codes d'erreur, utilitaires (hash, montants)
examples/n8n       Workflow d'exemple
docs/              Specs, plans, guide de déploiement
```

Outils : pnpm workspaces, Turborepo, TypeScript strict, Vitest, Playwright, ESLint, Prettier, GitHub Actions.

### 6.2 Interface des connecteurs

```ts
interface BankConnector {
  readonly provider: 'sandbox' | 'qonto' | 'revolut' | 'stripe';
  testConnection(): Promise<{ ok: boolean; detail?: string }>;
  createSingleUseCard(input: {
    amountCents: number; currency: string; merchant: string;
    expiresAt: Date; label: string; idempotencyKey: string;
  }): Promise<{ providerCardId: string; last4: string; expMonth: number; expYear: number;
               status: 'active' | 'pending_bank_sca'; scaUrl?: string }>;
  revealCard(providerCardId: string): Promise<{ number: string; expMonth: number; expYear: number; cvc: string; name: string }>;
  cancelCard(providerCardId: string): Promise<void>;
  listTransactions(since: Date): Promise<BankTransaction[]>;
}
```

- **Sandbox** : cartes simulées (numéros de test), transactions simulées déclenchables depuis l'app (« simuler un paiement »).
- **Stripe Issuing** : cardholder entreprise, carte virtuelle avec `spending_controls` (limite = montant exact), annulation, transactions via webhook / liste.
- **Qonto** : OAuth, création de carte virtuelle (peut retourner `pending_bank_sca` : l'approbateur valide aussi dans son app Qonto), plafond = montant.
- **Revolut Business** : jeton API / OAuth, `POST /cards` virtuelle avec limite de dépense, gel / suppression.
- Identifiants des connexions chiffrés en AES-256-GCM (clé `CONNECTIONS_KEY` dans les secrets du Worker).

### 6.3 Modèle de données (Supabase, schéma `public`, RLS sur toutes les tables)

| Table | Colonnes clés |
|---|---|
| `organizations` | `id`, `name`, `plan` (`sandbox`/`builder`/`team`/`business`), `stripe_customer_id`, `subscription_status`, `frozen_at`, `created_at` |
| `memberships` | `org_id`, `user_id`, `role` |
| `invitations` | `org_id`, `email`, `role`, `token_hash`, `expires_at` |
| `bank_connections` | `id`, `org_id`, `provider`, `label`, `credentials_ciphertext`, `status`, `last_sync_at` |
| `agents` | `id`, `org_id`, `name`, `platform`, `token_hash`, `token_prefix`, `bank_connection_id`, `status` (`active`/`frozen`), `last_used_at` |
| `policies` | `agent_id` (PK), `monthly_budget_cents`, `per_tx_limit_cents`, `currencies[]`, `merchant_allow[]`, `merchant_deny[]`, `mcc_allow[]`, `mcc_deny[]`, `auto_approve_below_cents`, `card_ttl_minutes`, `request_ttl_minutes` |
| `card_requests` | `id`, `org_id`, `agent_id`, `amount_cents`, `currency`, `merchant`, `mcc`, `purpose`, `status` (`pending`/`approved`/`rejected`/`expired`/`issued`/`failed`/`canceled`/`completed`), `decision_reason`, `decided_by`, `decided_at`, `expires_at` |
| `mandates` | `request_id`, `payload` (JSON canonique), `payload_hash`, `passkey_id`, `signature`, `authenticator_data`, `client_data_json`, `signed_at`, `auto_approved` |
| `cards` | `id`, `request_id`, `provider_card_id`, `last4`, `exp_month`, `exp_year`, `status`, `revealed_at`, `expires_at` — **aucun PAN, aucun CVC** |
| `transactions` | `id`, `org_id`, `card_id`, `provider_tx_id`, `amount_cents`, `currency`, `merchant_name`, `mcc`, `status`, `occurred_at`, `match_status` (`matched`/`mismatch`/`unmatched`) |
| `receipts` | `id`, `request_id`, `storage_path`, `filename`, `uploaded_by` |
| `audit_log` | `id` (bigserial), `org_id`, `actor_type` (`user`/`agent`/`system`), `actor_id`, `action`, `subject`, `data`, `prev_hash`, `hash`, `created_at` — insertion seule (trigger interdisant UPDATE/DELETE) |
| `passkeys` | `id`, `user_id`, `credential_id`, `public_key`, `counter`, `created_at` |
| `push_subscriptions` | `user_id`, `endpoint`, `keys` |
| `usage_counters` | `org_id`, `period` (AAAA-MM), `requests` |
| `waitlist` | `email`, `company`, `use_case`, `created_at` |

Le Worker utilise la clé `service_role` côté serveur uniquement ; l'app utilise la clé publique + RLS (lecture filtrée par appartenance à l'organisation). Toutes les écritures sensibles (approbation, connexion bancaire, gel) passent par `apps/api` avec le JWT Supabase de l'utilisateur.

### 6.4 Flux d'achat

1. L'agent appelle `request_card(4900, "EUR", "Notion", "abonnement équipe")`.
2. Auth : hash du jeton → agent actif, organisation non gelée, abonnement valide, quota disponible.
3. `policy.evaluate(policy, request, spentThisMonth)` → `reject(reason)` | `auto_approve` | `require_approval`.
4. `require_approval` : statut `pending`, push + email aux `approver`/`admin`/`owner`, audit `request.created`.
5. L'approbateur ouvre le mandat, l'app demande une assertion WebAuthn dont le challenge = `payload_hash`. Le Worker vérifie la signature, stocke le mandat, audit `request.approved`.
6. Le connecteur crée la carte à usage unique (montant exact, expiration `card_ttl_minutes`). Statut `issued`. Si la banque exige sa SCA : statut carte `pending_bank_sca` jusqu'à confirmation.
7. L'agent interroge `get_request_status` puis appelle `get_card_for_checkout` : `revealCard` chez la banque, réponse directe, `revealed_at` posé ; tout appel suivant renvoie `already_revealed`. Rien n'est journalisé hormis l'événement.
8. Cron : synchronisation des transactions, rapprochement (même carte, montant ≤ montant demandé, marchand comparé par similarité), `completed` ou alerte `mismatch` (gel de l'agent si règle « geler sur écart »). Cartes non utilisées : annulées à expiration.
9. Justificatif via `attach_receipt` ou upload ; exports CSV / FEC.

### 6.5 Moteur de règles (pur, testé exhaustivement)

Ordre d'évaluation, premier refus gagne :
1. Devise autorisée.
2. Montant > 0 et ≤ plafond par transaction.
3. Dépensé du mois (demandes `approved`/`issued`/`completed`) + montant ≤ budget mensuel.
4. Marchand dans `merchant_deny` → refus ; si `merchant_allow` non vide et marchand absent → refus.
5. MCC (si fourni) : `mcc_deny` → refus ; `mcc_allow` non vide et absent → refus.
6. Montant < `auto_approve_below_cents` **et** marchand dans `merchant_allow` (non vide) → auto-validation ; sinon validation humaine.

Codes de refus : `currency_not_allowed`, `over_transaction_limit`, `over_monthly_budget`, `merchant_blocked`, `merchant_not_allowed`, `mcc_blocked`, `mcc_not_allowed`, `invalid_amount`.

### 6.6 Journal d'audit

`hash = SHA-256(prev_hash || canonical_json({org_id, actor_type, actor_id, action, subject, data, created_at}))`. Écriture sérialisée par organisation (verrou consultatif Postgres via fonction RPC). Vérification d'intégrité dans l'app et à l'export.

### 6.7 Sécurité

- Jetons d'agent : 32 octets aléatoires, préfixe `art_live_` / `art_test_`, stockage SHA-256, affichage unique.
- Limitation de débit par agent (fenêtre glissante en base, 60 req/min).
- PAN / CVC : jamais en base, jamais dans les logs, jamais dans l'audit ; transit TLS uniquement.
- WebAuthn : vérification complète (origine, RP ID, compteur, user verification requise).
- CORS restreint aux origines de l'app ; CSP sur l'app et le site.
- Webhooks Stripe vérifiés par signature.
- Super-admin : liste d'emails dans `ADMIN_EMAILS`.
- Défense contre l'injection de prompt : les outils MCP n'exposent jamais d'actions d'administration (règles, approbation) ; l'agent ne peut que demander.

### 6.8 Gestion des erreurs

Format unique `{ "error": { "code": "...", "message": "..." } }`, codes HTTP cohérents. Côté MCP : résultat `isError: true` avec le même code. Échec banque : demande `failed`, motif enregistré, audit `card.issue_failed`, notification à l'approbateur.

## 7. Design & marque

- **Design system** : « Lucent » renommé **Artemis**, tous les tokens conservés (bleu électrique `#0000ff`, `paper`, `surface`, glass clair / givré, `gain` / `loss` / `pending`, ombres en escalier, Geist + Geist Mono), thèmes Jour et Nuit.
- **Glassmorphism minimal** : panneaux transparents sur `canvas` texturé (scanlines + un halo `neon`), fenêtres produit sur `paper`.
- **Logo** : symbole vectorisé en SVG (parallélogramme + carré). Variantes : blanc sur `canvas` (principale), `cobalt` sur `paper`, clair pour le thème Nuit ; favicon et icônes PWA dérivés.
- **Langue** : FR, montants au format `49,00 €`, `−42,10 €`, sentence case, handles en mono (`notion.agent`).
- L'artefact design system de Baptiste est mis à jour (titre Artemis, logo, conventions €).

## 8. Tests

- **Unitaires (Vitest)** : moteur de règles (chaque code de refus, cas limites), audit chaîné, chiffrement, hash de jeton, formatage des montants, export FEC, connecteurs (mocks HTTP).
- **Intégration** : routes Hono avec Supabase local (`supabase start`) en CI si possible, sinon client simulé.
- **Bout en bout (Playwright)** : inscription → agent → `request_card` via REST → validation (WebAuthn virtuel de Chromium) → `get_card_for_checkout` → simulation de paiement → rapprochement.
- **CI GitHub Actions** : lint, typecheck, tests, build sur chaque push.

## 9. Déploiement et coûts

| Service | Usage | Coût |
|---|---|---|
| Cloudflare Pages | `apps/site`, `apps/app` | 0 € |
| Cloudflare Workers (gratuit, 100 k req/jour) | `apps/api`, cron | 0 € |
| Supabase (gratuit, UE) | Postgres, Auth, Storage | 0 € |
| Resend (gratuit, 3 000 emails/mois) | Emails | 0 € |
| Stripe Billing | Abonnements | % des encaissements uniquement |
| Domaine | optionnel | ≈ 10 €/an |

Livrables de déploiement : `docs/deploiement.md` (pas à pas : comptes, variables, migrations, déploiement), `wrangler.toml`, fichiers `.env.example`.

**Garde-fou Supabase gratuit** : le projet est mis en pause après 7 jours d'inactivité ; le cron du Worker (toutes les 5 min) interroge la base, ce qui maintient l'activité.

## 10. Phases de livraison

1. **Socle** : monorepo, `packages/ui` (tokens + composants), logo SVG, site marketing complet, migrations SQL, CI.
2. **App** : auth, onboarding, organisations, membres, agents, règles, connexions (Sandbox).
3. **Cœur** : `apps/api` (REST + MCP), moteur de règles, audit, WebAuthn, notifications, flux complet en Sandbox, test E2E.
4. **Banques** : connecteurs Stripe Issuing, Qonto, Revolut ; cartes, transactions, rapprochement, justificatifs, exports CSV / FEC.
5. **Business** : Stripe Billing, quotas, back-office admin, docs MCP / n8n, guide de déploiement.

## 11. Actions du fondateur (hors code)

- [ ] Créer les comptes gratuits : Cloudflare, Supabase (région UE), Stripe, Resend.
- [ ] Renseigner les secrets (guide fourni).
- [ ] Demander l'accès API partenaire Qonto et l'accès Cards API Revolut Business.
- [ ] Vérifier les CGU des API bancaires pour l'usage par une application tierce.
- [ ] Recherche d'antériorité de marque « Artemis » (gratuite sur TMview / INPI) ; dépôt plus tard.
- [ ] Évaluer le périmètre PCI DSS avant la première remise de carte réelle.

## 12. Questions ouvertes (non bloquantes pour le développement)

- Conditions exactes des programmes partenaires Qonto / Revolut pour un éditeur tiers.
- Faut-il proposer la révélation via composants PCI bancaires (V2) pour sortir Artemis du périmètre PCI ?
- Ajout d'émetteurs supplémentaires (Swan, Wise) selon la demande des clients.


---

## V2 (2 novembre 2026) — après benchmark

Décisions validées par Baptiste, détaillées dans `docs/superpowers/plans/2026-11-02-artemis-v2.md` et `docs/benchmark-2026-11.md`. Elles remplacent les sections correspondantes ci-dessus.

1. **Positionnement** : « le pare-feu financier et la preuve AI Act de vos agents, sur la banque de votre choix ». On vend la gouvernance, pas la carte. Segment prioritaire : agences d'automatisation, puis startups IA.
2. **Rails** : Sandbox → Stripe Issuing → Revolut (sous accord écrit) → Qonto en lecture, gel et rapprochement uniquement (Qonto ne transmet pas le PAN par API et interdit de prêter la carte).
3. **Carte et PCI** : par défaut, le PAN ne transite plus par Artemis. L'agent reçoit un lien éphémère (10 min, usage unique) qui affiche la carte depuis l'émetteur (Stripe Issuing Elements). La remise directe devient une option par organisation, désactivée par défaut (§5.4 et §6.4 étape 7 remplacés).
4. **Tarifs** (§4 remplacé) : Sandbox 0 € (1 agent, 20 mandats) · Builder 29 € (3 agents, 50 mandats, 1 banque) · Team 99 € (10 agents, 300 mandats, 2 banques, Slack, quorum, FEC, abonnements) · Agences 249 € + 15 €/client actif (clients illimités, 25 agents, 1 000 mandats) · Business dès 690 € (illimité, dossier AI Act). Dépassement 0,25 € par mandat sur les plans payants (Stripe meter).
5. **Nouvelles fonctions** : mode agence (clients, budgets, marge, rapports), garde-fous (vitesse, anomalie de montant, liste noire MCC, gel si justificatif manquant), CLI `npx artemis init`, skill Claude, nœud n8n, approbation Slack et quorum, abonnements récurrents gérés par agent, dossier et rapport AI Act.
6. **Juridique** : micro-entreprise pour démarrer ; SASU au premier contrat bancaire ou à 1 500 € de MRR.
