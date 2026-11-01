# Artemis

**Vos agents paient. Vous gardez le dernier mot.**

Artemis est le **pare-feu financier et la preuve AI Act de vos agents IA**, sur la banque de votre choix. Un agent (Claude, ChatGPT, n8n, Make, votre code) demande une dépense ; Artemis applique vos règles (budgets, plafonds, marchands, garde-fous anti-injection), recueille une validation humaine signée par passkey, fait créer une carte virtuelle à usage unique **par votre banque**, puis rapproche, justifie et prouve chaque achat. Artemis ne détient jamais d'argent.

- **Rails** : Sandbox (simulée) → Stripe Issuing → Revolut Business (sous accord écrit de Revolut) → Qonto en lecture, gel et rapprochement.
- **Carte et PCI** : par défaut, le numéro de carte ne passe jamais par Artemis. L'agent reçoit un lien éphémère à usage unique qui affiche la carte depuis l'émetteur. La remise directe est une option avancée, désactivée par défaut.
- **Pour les agences** : espaces clients, budgets et refacturation avec marge, rapports mensuels.
- **Tarifs** : Sandbox 0 € · Builder 29 € · Team 99 € · Agences 249 € + 15 €/client actif · Business dès 690 € · dépassement 0,25 €/mandat.

Documents : conception `docs/superpowers/specs/`, plans `docs/superpowers/plans/`, benchmark `docs/benchmark-2026-11.md`, mise en ligne `docs/deploiement.md`.

## Structure

| Dossier | Rôle |
| --- | --- |
| `apps/site` | Site marketing et documentation (Astro) |
| `apps/app` | Application client PWA (React + Vite) |
| `apps/api` | API REST, serveur MCP, webhooks, cron (Cloudflare Worker, Hono) |
| `packages/shared` | Montants, erreurs, schémas, crypto, plans |
| `packages/ui` | Design system Artemis (tokens, composants, logo) |
| `packages/policy` | Moteur de règles |
| `packages/connectors` | Connecteurs bancaires (Sandbox, Stripe, Qonto, Revolut) |
| `packages/db` | Migrations Supabase |

## Commandes

```bash
pnpm install
pnpm test        # tests unitaires
pnpm typecheck
pnpm build
pnpm e2e         # parcours complet (Playwright)
```

Documentation : `docs/superpowers/specs/` (conception), `docs/deploiement.md` (mise en ligne).
