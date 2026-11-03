# Artemis — Prêt pour les premières agences payantes (conception)

Date : 3 novembre 2026. Validé avec Baptiste section par section.

## 1. Intention

| | |
|---|---|
| Jalon | Premiers clients payants |
| Cible | Agences d'automatisation (n8n, Make, IA) qui gèrent des agents pour leurs clients |
| Flux d'argent | Au choix par client : l'agence avance et refacture (défaut), ou le client paie avec sa propre banque |
| Client final | Portail client léger (voir, justifier, valider au-delà d'un seuil) |
| Vérification | Scénarios simulés + passage réel Stripe en mode test + agence pilote réelle 2 semaines |
| Approche | A — trois lots : parcours A→Z blindé, mode agence v2 minimal, pilote |
| Contraintes | Coût fixe ≈ 0 € (offres gratuites), micro-entreprise, 24 langues obligatoires (CLAUDE.md), carte complète jamais stockée |

Hypothèses (non dites, à corriger si besoin) : l'agence pilote est française ; la production se déploie depuis la branche de production (aujourd'hui `claude/fervent-davinci-ll5kpx`, à renommer `main`).

## 2. Benchmark (novembre 2026) : ce qui change

- Les grandes banques livrent des cartes pour agents avec validation humaine : Mercury Agent Cards, demandes de dépense Stripe Link, Ramp × Visa. Toutes mono-banque, sans mode agence.
- Visa Intelligent Commerce est en service en Europe (plus de 30 banques, passkeys de paiement, annuaire des agents vérifiés) ; Mastercard Agent Pay a fait un premier paiement réel avec Santander.
- Norme AP2 : mandats signés, même concept qu'Artemis (export compatible prévu plus tard, hors périmètre).
- Besoin non couvert chez les agences : refacturer avec marge les coûts d'IA (jetons) et pas seulement les achats par carte ; les outils existants passent par un portefeuille prépayé par client.

Conséquence : la différenciation d'Artemis pour les agences = multi-banque + séparation par client + refacturation complète (cartes + coûts IA) + facturation légale + preuve signée.

## 3. Lot 1 — Parcours A→Z blindé

### 3.1 Matrice de scénarios (Playwright, bout en bout, simulé, en anglais et en français au minimum)

Rôles : propriétaire, admin, approbateur, lecteur, client final (portail), agent via MCP, REST, CLI, n8n.

Parcours : inscription → onboarding agence → client → agent par client → règles → demande → validation passkey → remise de carte (lien éphémère, remise directe, Qonto affichage humain) → paiement simulé → rapprochement → rapport → facture → paiement de la facture → abonnement Artemis (Stripe simulé) → invitation d'un collègue → changement de langue.

Cas d'erreur couverts : validation automatique, refus, expiration, quorum à 2 (dont validations simultanées), budget agent et client dépassés, MCC interdit, limite horaire, montant inhabituel, carte déjà remise ou expirée, paiement chez un autre marchand (gel automatique), justificatif manquant (gel automatique), gel d'urgence et dégel, quota et dépassement, banque en panne, webhook Stripe rejoué ou falsifié, jeton d'agent volé (révocation, rotation), session expirée, réseau coupé.

### 3.2 Trous à combler dans le produit

1. **Perte de passkey** : plusieurs passkeys par personne (ajout d'un second appareil proposé à l'onboarding) ; récupération par un autre propriétaire ou admin (nouvelle passkey après lien email + délai de 24 h, inscrit au journal, notification à toute l'équipe). Une organisation sans aucun autre admin : récupération par email + délai de 72 h, cartes gelées pendant le délai.
2. **Demande en double** : clé anti-doublon `idempotency_key` (unique par agent, 24 h) sur `POST /v1/card-requests` et `request_card` MCP ; une répétition renvoie la même demande.
3. **Rapprochement des marchands** : normalisation renforcée (« Notion » ≈ « NOTION.SO », « NOTION LABS INC ») avec liste d'alias apprise des rapprochements validés à la main.
4. **Calendrier des budgets** : fuseau horaire de l'organisation (par défaut Europe/Paris), fin de mois, remboursements et paiements partiels (le budget est recrédité), devises autres que l'euro (conversion au taux du jour affichée, budget en euros).
5. **RGPD** : export complet des données de l'organisation (JSON + justificatifs), suppression de l'organisation (30 jours de délai, puis effacement ; journal d'audit conservé anonymisé le temps légal), durée de conservation documentée.

### 3.3 Fiabilité (offres gratuites)

- Environnement de test (staging) : second projet Supabase gratuit, Workers `artemis-*-staging`, déployé à chaque push par GitHub Actions.
- Supervision : vérification toutes les 5 minutes (tâche planifiée existante) + workflow GitHub de sonde externe ; email d'alerte en cas d'erreur 5xx répétée ou de panne ; page de statut publique sur le site.
- Sauvegardes : export quotidien chiffré de la base vers Cloudflare R2 (gratuit jusqu'à 10 Go), 30 jours de rétention, test de restauration mensuel automatisé sur l'environnement de test.

### 3.4 Onboarding agence

Liste guidée (profil légal, premier client, premier agent, règles, banque, passkey de secours, première carte Sandbox), données de démonstration activables, modèles de règles prêts à l'emploi (« Abonnements SaaS », « Publicité », « Achats ponctuels »).

Critère de réussite du lot 1 : toute la matrice passe dans la CI.

## 4. Lot 2 — Mode agence v2

### 4.1 Portail client

- Invitation par email de l'agence ; connexion par lien email puis passkey ; nouveau rôle `client` rattaché à un `client_id` (accès strictement limité à ce client, RLS).
- Voit : dépenses, justificatifs, rapport du mois, factures, mandats signés (preuve AI Act).
- Valide avec sa passkey les demandes au-dessus du seuil fixé par l'agence (`clients.approval_above_cents`) ; sa signature rejoint le mandat (table `approvals`). Si le seuil est atteint, la validation de l'agence ET du client sont requises.
- Ne peut pas modifier agents, règles ou banque de l'agence.

### 4.2 Banque par client

- `clients.billing_mode` : `agency` (défaut) ou `own_bank`. En `own_bank`, `clients.bank_connection_id` : le client branche sa banque depuis son portail, ou l'agence la saisit. Les agents du client utilisent cette banque.
- Rapport et facture indiquent qui a payé chaque ligne ; les achats payés par le client ne sont pas refacturés (seuls les honoraires et coûts le sont).

### 4.3 Coûts externes (IA, outils, temps)

- Table `client_costs` : client, date, libellé, catégorie (IA, outil, temps, autre), montant, devise, justificatif, source (`manual`, `csv`, `api`).
- Saisie manuelle, import CSV, `POST /v1/costs` (jeton d'agent ou de l'org) et outil MCP `record_cost`.
- La marge du client s'applique (paramétrable : tous les coûts, ou cartes seulement).
- Pas de connexion directe aux comptes OpenAI/Anthropic dans cette version.

### 4.4 Facturation légale au nom de l'agence

- Profil légal de l'agence : raison sociale, SIREN/SIRET, adresse, logo, régime de TVA (franchise art. 293 B ou taux), IBAN, délai de paiement, pénalités de retard, indemnité forfaitaire de 40 €.
- Fiche client : raison sociale, adresse, SIREN, numéro de TVA (vérifié via VIES pour l'UE), langue.
- Facture : lignes (achats refacturés au coût + marge ou frais de gestion, coûts externes, honoraires), TVA par ligne, trois régimes (France ; client pro UE : autoliquidation ; hors UE).
- Numérotation chronologique continue par agence (séquence verrouillée en base), facture émise immuable ; correction par avoir ; chaque émission et avoir inscrits au journal signé.
- Format Factur-X (PDF/A-3 + XML CII), dans la langue du client, envoyé par email, inclus dans l'export FEC et Pennylane.
- Brouillon automatique en fin de mois à partir du relevé ; l'agence relit et émet en un clic, ou active l'émission automatique.
- Paiement en ligne : l'agence branche son compte Stripe (clé restreinte) ; un lien de paiement (carte, prélèvement SEPA) par facture ; statut « payée » automatique par webhook ; relances automatiques à J+7 et J+30 (désactivables).
- Calendrier légal : réception électronique obligatoire depuis le 1er septembre 2026 ; émission via plateforme agréée obligatoire pour PME et micro-entreprises au 1er septembre 2027 → raccordement à une plateforme agréée par API, inscrit au plan avant juillet 2027 (hors pilote).
- CGV : Artemis est l'outil, l'agence reste responsable du contenu de ses factures.

### 4.5 Facturation d'Artemis à l'agence

Inchangée : 249 €/mois + 15 €/client actif + dépassements (compteurs Stripe).

Critère de réussite du lot 2 : agence de démonstration avec 3 clients (agence + marge 15 %, banque propre, validation client au-delà de 200 €) → 3 relevés et 3 factures justes au centime, un avoir corrige une erreur, numérotation continue, Factur-X validé par un validateur public, un paiement en ligne marque la facture payée.

## 5. Lot 3 — Pilote et production

1. Environnements : test (Supabase + Stripe test, déployé à chaque push) et production (déployée depuis la branche de production après CI verte).
2. Passage Stripe en mode test automatisé chaque nuit sur l'environnement de test : carte Issuing de test, autorisation simulée (outils de test Stripe), webhooks réels, abonnement Artemis, paiement d'une facture client.
3. Agence pilote 2 semaines : 2 ou 3 de ses clients, dépenses réelles < 50 €/carte, appel de démarrage, point hebdomadaire, bouton « Signaler un problème » ; mesures : temps jusqu'à la première carte, temps de validation, erreurs, factures émises. Risque : validation Stripe Issuing de l'agence (plusieurs semaines) → demande lancée dès le début du lot 1 ; plan B : pilote en Sandbox avec facturation réelle.
4. Juridique : DPA (sous-traitance RGPD) signable en ligne, registre des traitements, liste des sous-traitants (Cloudflare, Supabase, Stripe, Resend), CGV mises à jour (service de facturation), mentions légales complétées par Baptiste, page sécurité à jour.
5. Support : centre d'aide (24 langues), email de support, page de statut, guide « Agence : premiers pas ».
6. Go / no-go avant le premier client payant : matrice verte, passage Stripe test vert, restauration de sauvegarde réussie, alertes testées, documents juridiques en ligne, pilote terminé sans défaut bloquant.

## 6. Modèle de données (ajouts)

- `memberships.client_id` (nullable) + rôle `client`.
- `clients` : `billing_mode`, `bank_connection_id`, `approval_above_cents`, `legal_name`, `address`, `siren`, `vat_number`, `country`, `locale`, `timezone`.
- `organizations` : profil légal de l'agence (`legal_name`, `siren`, `address`, `vat_regime`, `vat_rate`, `iban`, `payment_terms_days`, `logo_path`), `timezone`, `stripe_invoicing_key_ciphertext`.
- `card_requests.idempotency_key` (unique par agent).
- `passkeys` : plusieurs par utilisateur (déjà possible) ; table `recovery_requests` (demandeur, approbateur, délai, statut).
- `merchant_aliases` (org, alias, marchand canonique).
- `client_costs`, `invoices` (numéro, statut brouillon/émise/payée/annulée, totaux, Factur-X), `invoice_lines`, `invoice_sequences` (verrou par agence), `credit_notes`.
- Toutes les tables : RLS par organisation ; rôle `client` limité à son `client_id`.

## 7. Hors périmètre (après le pilote, seulement si demandé)

Portefeuille prépayé par client, export de mandats au format AP2, marque blanche, connexion directe aux comptes OpenAI/Anthropic, raccordement à une plateforme agréée (planifié avant juillet 2027).

## 8. Tests

- Unitaires : TVA (3 régimes), numérotation concurrente, avoirs, marge, Factur-X (validation XML), anti-doublon, budgets en fin de mois et fuseau, alias de marchands, récupération de passkey.
- Bout en bout : toute la matrice du lot 1 + scénario agence à 3 clients du lot 2.
- Nuit : passage Stripe en mode test sur l'environnement de test.
- Règle i18n : chaque nouveau texte (portail, factures, emails, relances) dans les 24 langues.
