#!/usr/bin/env bash
# Déploie l'API (+ MCP, webhooks, cron), l'app et le site sur Cloudflare Workers, puis pose les secrets de l'API.
# Prérequis : CLOUDFLARE_API_TOKEN (modèle « Edit Cloudflare Workers ») et CLOUDFLARE_ACCOUNT_ID.
# Optionnel : CF_WORKERS_SUBDOMAIN (sinon lu sur le compte), ADMIN_EMAILS, et les secrets listés dans scripts/cf-secrets.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN manquant}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID manquant}"

if [ -z "${CF_WORKERS_SUBDOMAIN:-}" ]; then
  CF_WORKERS_SUBDOMAIN=$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);process.stdout.write(r.result?.subdomain??"")})') || true
fi
: "${CF_WORKERS_SUBDOMAIN:?Sous-domaine workers.dev introuvable : ouvrez une fois Workers & Pages dans le tableau de bord Cloudflare pour le créer, ou définissez CF_WORKERS_SUBDOMAIN}"
SUB="$CF_WORKERS_SUBDOMAIN"
API_URL="${API_URL:-https://artemis-api.$SUB.workers.dev}"
APP_URL="${APP_URL:-https://artemis-app.$SUB.workers.dev}"
SITE_URL="${SITE_URL:-https://artemis-site.$SUB.workers.dev}"

[ -d node_modules ] || pnpm install --frozen-lockfile

echo "→ API"
VARS=(--var "APP_ORIGIN:$APP_URL" --var "SITE_ORIGIN:$SITE_URL"
      --var "WEBAUTHN_RP_ID:${APP_URL#https://}" --var "WEBAUTHN_ORIGIN:$APP_URL")
[ -n "${ADMIN_EMAILS:-}" ] && VARS+=(--var "ADMIN_EMAILS:$ADMIN_EMAILS")
(cd apps/api && npx wrangler deploy "${VARS[@]}")

echo "→ Secrets de l'API"
node scripts/cf-secrets.mjs

echo "→ App"
(cd apps/app && VITE_API_URL="$API_URL" VITE_SITE_URL="$SITE_URL" npx vite build && npx wrangler deploy)

echo "→ Site"
(cd apps/site && PUBLIC_API_URL="$API_URL" PUBLIC_APP_URL="$APP_URL" PUBLIC_SITE_URL="$SITE_URL" npx astro build && npx wrangler deploy)

echo "→ Vérification"
curl -fsS "$API_URL/health" && echo
{
  echo "API  : $API_URL  (MCP : $API_URL/mcp)"
  echo "App  : $APP_URL"
  echo "Site : $SITE_URL"
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
