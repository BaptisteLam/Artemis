# Mettre Artemis en ligne (coût fixe : 0 €)

Durée : environ 45 minutes. Tout tient dans des offres gratuites. Seul un nom de domaine (≈ 10 €/an) est optionnel.

## 0. Ce qui est déjà fait

- **Base de données Supabase** : projet `Artemis` (`jrlripockeiivegqbeng`, Francfort, offre gratuite) créé, migrations `packages/db/migrations/0001` à `0004` appliquées, bucket privé `receipts` créé.
  - URL : `https://jrlripockeiivegqbeng.supabase.co`
  - Clé publique (publishable) : dans `apps/app/.env.production`

## 1. Supabase : finir la configuration (5 min)

1. Ouvrez le projet **Artemis** sur supabase.com.
2. **Project Settings → API** : copiez la clé `service_role` (secrète, elle va uniquement dans le Worker, jamais dans le code).
3. **Authentication → URL Configuration** :
   - *Site URL* : l'adresse de l'app (ex. `https://artemis-app.pages.dev`)
   - *Redirect URLs* : ajoutez `https://artemis-app.pages.dev/auth/callback` (et `http://localhost:5173/auth/callback` pour le développement)
4. **Authentication → Providers → Email** : laissez « Email » activé (lien magique). L'offre gratuite envoie peu d'emails par heure : branchez Resend en SMTP (étape 4) dès les premiers clients.

> Garde-fou : un projet Supabase gratuit se met en pause après 7 jours sans activité. La tâche planifiée du Worker (toutes les 5 minutes) interroge la base et la garde active.

## 2. Cloudflare : l'API (Worker) (15 min)

```bash
pnpm install
cd apps/api
npx wrangler login
```

```bash
openssl rand -base64 32   # → CONNECTIONS_KEY (gardez-la précieusement : sans elle, les banques connectées sont illisibles)
```

```bash
npx wrangler secret put SUPABASE_URL                 # https://jrlripockeiivegqbeng.supabase.co
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CONNECTIONS_KEY
```

Dans `apps/api/wrangler.toml`, section `[vars]`, remplacez les adresses par les vôtres (`APP_ORIGIN`, `SITE_ORIGIN`, `WEBAUTHN_RP_ID` = domaine de l'app sans `https://`, `WEBAUTHN_ORIGIN`, `ADMIN_EMAILS` = votre email), puis :

```bash
npx wrangler deploy
```

Notez l'URL affichée (`https://artemis-api.<compte>.workers.dev`) et testez `…/health`.

## 3. Cloudflare Pages : l'app et le site (10 min)

Dans le tableau de bord Cloudflare → **Workers & Pages → Créer → Pages → Connecter à Git** (dépôt `Artemis`), créez deux projets :

| Projet | Commande de build | Dossier de sortie | Variables |
| --- | --- | --- | --- |
| `artemis-app` | `pnpm install && pnpm --filter app build` | `apps/app/dist` | `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL` |
| `artemis` (site) | `pnpm install && pnpm --filter site build` | `apps/site/dist` | `PUBLIC_API_URL`, `PUBLIC_APP_URL`, `PUBLIC_SITE_URL` |

Mettez à jour `VITE_API_URL` dans `apps/app/.env.production` avec l'URL du Worker.

**Mentions légales** : complétez `apps/site/src/legal.ts` (nom, SIRET, adresse, email) avant d'ouvrir au public.

## 4. Optionnel mais recommandé

- **Emails (Resend, gratuit 3 000/mois)** : créez un compte, vérifiez votre domaine, puis `npx wrangler secret put RESEND_API_KEY` et réglez `EMAIL_FROM` dans `wrangler.toml`. Vous pouvez aussi utiliser Resend comme SMTP dans Supabase (Authentication → SMTP).
- **Notifications push** : `npx web-push generate-vapid-keys`, puis `wrangler secret put VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`.

## 5. Encaisser les abonnements (Stripe, sans frais fixes)

1. Créez un compte Stripe au nom de votre micro-entreprise.
2. **Produits** : créez « Artemis Builder » 19 €/mois, « Team » 49 €/mois, « Business » 149 €/mois (récurrent). Copiez les trois `price_…`.
3. **Paramètres → Facturation → Factures** : ajoutez la mention « TVA non applicable, art. 293 B du CGI » dans le pied de facture.
4. **Portail client** : activez-le (changement de plan, résiliation, factures).
5. **Webhooks** : ajoutez `https://<worker>/webhooks/stripe-billing` avec les événements `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copiez le secret `whsec_…`.
6. Secrets :

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_BUILDER
npx wrangler secret put STRIPE_PRICE_TEAM
npx wrangler secret put STRIPE_PRICE_BUSINESS
```

Stripe prélève environ 1,5 % + 0,25 € par paiement européen : vous ne payez que lorsque vous encaissez.

## 6. Banques des clients (réel)

Rien à payer pour vous : chaque client connecte **sa** banque dans l'app (page Banques).

| Banque | Ce que le client fournit | Remarque |
| --- | --- | --- |
| Stripe Issuing | Clé restreinte Issuing + titulaire ou adresse + secret de webhook | Webhook : `https://<worker>/webhooks/stripe-issuing/<id-connexion>` (affiché dans l'app) |
| Revolut Business | Jeton Business API (plan payant, accès « Cards API » demandé au support) | Remise automatique de la carte à l'agent |
| Qonto | Jeton OAuth (programme partenaires), ID membre et ID compte | Qonto ne transmet pas la carte par API : l'approbateur l'affiche et finalise le paiement |

À faire de votre côté : candidater aux programmes partenaires **Qonto** et **Revolut Business API**, et relire leurs conditions d'utilisation pour une application tierce. Les connecteurs Qonto et Revolut ont été écrits sans accès direct à leur documentation (domaines bloqués dans l'environnement de build) : testez-les en sandbox avant d'ouvrir.

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
| Cloudflare Workers + Pages (gratuit) | 0 € |
| Supabase (gratuit, UE) | 0 € |
| Resend (gratuit) | 0 € |
| Stripe Billing | % des encaissements seulement |
| Domaine | ≈ 10 €/an, optionnel |
