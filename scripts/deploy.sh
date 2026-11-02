#!/usr/bin/env bash
# Déploie l'API (+ MCP, webhooks, cron), l'app et le site sur Cloudflare Workers.
# Prérequis : CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID dans l'environnement ; secrets de l'API déjà posés (voir docs/deploiement.md).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN manquant}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID manquant}"
SUB="${CF_WORKERS_SUBDOMAIN:?CF_WORKERS_SUBDOMAIN manquant (ex. baptiste pour *.baptiste.workers.dev)}"
API_URL="${API_URL:-https://artemis-api.$SUB.workers.dev}"
APP_URL="${APP_URL:-https://artemis-app.$SUB.workers.dev}"
SITE_URL="${SITE_URL:-https://artemis-site.$SUB.workers.dev}"

pnpm install --frozen-lockfile

echo "→ API"
(cd apps/api && npx wrangler deploy \
  --var APP_ORIGIN:"$APP_URL" --var SITE_ORIGIN:"$SITE_URL" \
  --var WEBAUTHN_RP_ID:"${APP_URL#https://}" --var WEBAUTHN_ORIGIN:"$APP_URL")

echo "→ App"
(cd apps/app && VITE_API_URL="$API_URL" VITE_SITE_URL="$SITE_URL" npx vite build && npx wrangler deploy)

echo "→ Site"
(cd apps/site && PUBLIC_API_URL="$API_URL" PUBLIC_APP_URL="$APP_URL" PUBLIC_SITE_URL="$SITE_URL" npx astro build && npx wrangler deploy)

echo "✓ API  $API_URL/health"
echo "✓ App  $APP_URL"
echo "✓ Site $SITE_URL"
