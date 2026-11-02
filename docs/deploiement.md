# Mettre Artemis en ligne (coût fixe : 0 €)

Durée : environ 45 minutes. Tout tient dans des offres gratuites. Seul un nom de domaine (≈ 10 €/an) est optionnel.

## 0. Ce qui est déjà fait

- **Base de données Supabase** : projet `Artemis` (`jrlripockeiivegqbeng`, Francfort, offre gratuite) créé, migrations `0001` à `0005` appliquées, bucket privé `receipts` créé.
- **Appliquées** (2 nov. 2026) : `0011_performance` (index des clés étrangères, RLS optimisée) et migrations `0006` à `0010` regroupées sous `0006_0010_v2_features` (remise de carte, mode agence, garde-fous, quorum/Slack, abonnements). Sur le projet hébergé, l'ancienne version à 3 arguments de `create_card_request` reste en place mais n'est plus appelée ; l'API utilise toujours la version à 4 arguments.
  - URL : `https://jrlripockeiivegqbeng.supabase.co`
  - Clé publique (publishable) : dans `apps/app/.env.production`

## 1. Supabase : finir la configuration (5 min)

1. Ouvrez le projet **Artemis** sur supabase.com.
2. **Project Settings → API** : copiez la clé `service_role` (secrète : elle va uniquement dans les secrets GitHub, jamais dans le code).
3. **Authentication → URL Configuration** : voir l'étape 3, une fois les adresses connues.
4. **Authentication → Providers → Email** : laissez « Email » activé (lien magique). L'offre gratuite envoie peu d'emails par heure : branchez Resend en SMTP (étape 4) dès les premiers clients.

> Garde-fou : un projet Supabase gratuit se met en pause après 7 jours sans activité. La tâche planifiée du Worker (toutes les 5 minutes) interroge la base et la garde active.

## 2. Cloudflare : tout héberger (API + MCP, app, site) — 10 min, puis automatique

Les trois services tournent sur **Cloudflare Workers** (offre gratuite) :

| Worker | Contenu | Adresse |
| --- | --- | --- |
| `artemis-api` | API REST `/v1`, serveur MCP `/mcp`, webhooks, tâche planifiée (5 min) | `https://artemis-api.<sous-domaine>.workers.dev` |
| `artemis-app` | Application (PWA) | `https://artemis-app.<sous-domaine>.workers.dev` |
| `artemis-site` | Site public | `https://artemis-site.<sous-domaine>.workers.dev` |

Le déploiement est fait par **GitHub Actions** (`.github/workflows/deploy.yml`) après chaque CI verte, ou à la demande (onglet *Actions* → *Déploiement Cloudflare* → *Run workflow*). Tant que les secrets ne sont pas posés, il s'arrête sans rien faire.

À faire une seule fois :

1. **Cloudflare** → *My Profile → API Tokens → Create Token* → modèle **« Edit Cloudflare Workers »** → *Account Resources* : votre compte → créer. Copiez le jeton.
2. Toujours dans Cloudflare, notez l'**Account ID** (colonne de droite de *Workers & Pages*). Si vous n'avez jamais ouvert *Workers & Pages*, ouvrez-le une fois : cela crée votre sous-domaine `workers.dev`.
3. **GitHub** → dépôt *Artemis* → *Settings → Secrets and variables → Actions* → *New repository secret* :

| Secret | Valeur | Obligatoire |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | le jeton de l'étape 1 | oui |
| `CLOUDFLARE_ACCOUNT_ID` | l'Account ID | oui |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → *Project Settings → API* → `service_role` | oui |
| `RESEND_API_KEY`, `STRIPE_*` | voir étapes 4 et 5 | plus tard |

   Onglet *Variables* (facultatif) : `ADMIN_EMAILS` = votre email (accès à la page d'administration).

4. Lancez le workflow (*Actions → Déploiement Cloudflare → Run workflow*), ou attendez le prochain push : il part seul après chaque CI verte. Le résumé du run affiche les trois adresses.

Ce que le script fait seul : il lit votre sous-domaine, déploie les trois Workers avec les bonnes adresses croisées (CORS, passkeys, liens éphémères), pose `SUPABASE_URL`, et **génère une seule fois** `CONNECTIONS_KEY` (chiffrement des accès bancaires) et les clés VAPID (notifications push). Une clé déjà posée sur Cloudflare n'est jamais remplacée. Pour garder une copie de `CONNECTIONS_KEY`, générez-la vous-même (`openssl rand -base64 32`) et ajoutez-la comme secret GitHub **avant** le premier déploiement.

Déploiement depuis un poste : `CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… SUPABASE_SERVICE_ROLE_KEY=… bash scripts/deploy.sh`.

## 3. Supabase : adresses de connexion (2 min, après le premier déploiement)

**Authentication → URL Configuration** :
- *Site URL* : `https://artemis-app.<sous-domaine>.workers.dev`
- *Redirect URLs* : `https://artemis-app.<sous-domaine>.workers.dev/**` (et `http://localhost:5173/**` pour le développement)

**Mentions légales** : complétez `apps/site/src/legal.ts` (nom, SIRET, adresse, email) avant d'ouvrir au public.

**Nom de domaine (plus tard)** : ajoutez-le dans Cloudflare, attachez-le aux Workers (*Settings → Domains & Routes*), puis définissez `API_URL`, `APP_URL`, `SITE_URL` dans le workflow.

## 4. Optionnel mais recommandé

- **Emails (Resend, gratuit 3 000/mois)** : créez un compte, vérifiez votre domaine, ajoutez le secret GitHub `RESEND_API_KEY` et réglez `EMAIL_FROM` dans `wrangler.toml`. Vous pouvez aussi utiliser Resend comme SMTP dans Supabase (Authentication → SMTP).
- **Notifications push** : clés VAPID générées automatiquement au premier déploiement.

## 5. Encaisser les abonnements (Stripe, sans frais fixes)

1. Créez un compte Stripe au nom de votre micro-entreprise.
2. **Produits** : créez « Artemis Builder » 29 €/mois, « Team » 99 €/mois, « Agences » 249 €/mois, « Business » 690 €/mois (récurrent). Copiez les quatre `price_…`.
3. **Paramètres → Facturation → Factures** : ajoutez la mention « TVA non applicable, art. 293 B du CGI » dans le pied de facture.
4. **Portail client** : activez-le (changement de plan, résiliation, factures).
5. **Webhooks** : ajoutez `https://<worker>/webhooks/stripe-billing` avec les événements `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copiez le secret `whsec_…`.
6. Secrets GitHub (*Settings → Secrets and variables → Actions*) : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BUILDER`, `STRIPE_PRICE_TEAM`, `STRIPE_PRICE_AGENCY`, `STRIPE_PRICE_BUSINESS`, puis relancez le déploiement.

Stripe prélève environ 1,5 % + 0,25 € par paiement européen : vous ne payez que lorsque vous encaissez.

## 6. Banques des clients (réel)

Rien à payer pour vous : chaque client connecte **sa** banque dans l'app (page Banques).

| Banque | Ce que le client fournit | Remarque |
| --- | --- | --- |
| Stripe Issuing | Clé restreinte Issuing + titulaire ou adresse + secret de webhook | Webhook : `https://<worker>/webhooks/stripe-issuing/<id-connexion>` (affiché dans l'app) |
| Revolut Business | Jeton Business API (plan Grow+, accès « Cards API » demandé au support) | **Accord écrit de Revolut obligatoire** (« Valid Permission », api-requests@revolut.com) avant tout usage en production |
| Qonto | Jeton OAuth (programme partenaires), ID membre et ID compte | Lecture, gel et rapprochement uniquement : Qonto ne transmet pas la carte et interdit de la prêter |

À faire de votre côté : candidater aux programmes partenaires **Qonto** et **Revolut Business API**, et relire leurs conditions d'utilisation pour une application tierce. Les connecteurs Qonto et Revolut ont été écrits sans accès direct à leur documentation (domaines bloqués dans l'environnement de build) : testez-les en sandbox avant d'ouvrir.

## 6 bis. Société et dépassements

- **Micro-entreprise** au démarrage (plafond services 83 600 € en 2026-2028, franchise de TVA 37 500 €). Passez en **SASU** dès le premier contrat bancaire (Stripe Issuing, Revolut, Qonto) ou à 1 500 € de MRR : les partenaires bancaires exigent une société.
- **Dépassements et clients d'agence** : créez dans Stripe deux compteurs (*Billing → Meters*) `artemis_mandate_overage` et `artemis_active_client` (agrégation : somme), puis deux prix à l'usage rattachés à ces compteurs (0,25 € et 15 €, mensuels). Secrets GitHub : `STRIPE_METER_OVERAGE` / `STRIPE_METER_ACTIVE_CLIENT` (noms d'événements) et `STRIPE_PRICE_OVERAGE` / `STRIPE_PRICE_ACTIVE_CLIENT` (identifiants `price_…`). Les prix à l'usage sont ajoutés automatiquement au paiement (dépassement : Builder, Team, Agences ; client actif : Agences).
- **Lien éphémère de carte (Stripe)** : chaque client Stripe renseigne aussi sa clé publiable (`pk_live_…`) dans la connexion ; la page `/c/<jeton>` de l'app affiche la carte via Stripe Issuing Elements, sans que le numéro passe par Artemis.

## 7. Vérifications avant d'ouvrir

- [ ] `https://<worker>/health` répond `{"ok":true}`
- [ ] Inscription par lien magique, onboarding, passkey
- [ ] Un agent Claude Code obtient une carte Sandbox et la paie (« Simuler un paiement »)
- [ ] Abonnement test Stripe (carte 4242…) → plan mis à jour
- [ ] Mentions légales complétées
- [ ] PCI DSS : avant la première carte **réelle** remise à un agent, évaluez votre périmètre (les numéros transitent par le Worker sans être stockés)

## Coûts récapitulés

| Poste | Coût |
| --- | --- |
| Cloudflare Workers (gratuit, 100 000 requêtes/jour) | 0 € |
| Supabase (gratuit, UE) | 0 € |
| Resend (gratuit) | 0 € |
| Stripe Billing | % des encaissements seulement |
| Domaine | ≈ 10 €/an, optionnel |
