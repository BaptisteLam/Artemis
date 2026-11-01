# Artemis

**Vos agents paient. Vous gardez le dernier mot.**

Artemis donne aux agents IA d'une entreprise (Claude, ChatGPT, n8n) une carte virtuelle à usage unique,
créée dans la banque professionnelle du client (Qonto, Revolut Business, Stripe Issuing), après validation
humaine signée par passkey. Artemis ne détient jamais d'argent.

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
