#!/usr/bin/env node
// Pose les secrets du Worker artemis-api en une requête (wrangler secret bulk).
// - Les valeurs présentes dans l'environnement (ex. secrets GitHub) sont envoyées.
// - CONNECTIONS_KEY et les clés VAPID sont générées UNE fois si elles n'existent ni dans l'environnement
//   ni déjà sur Cloudflare. Une clé déjà posée sur Cloudflare n'est jamais remplacée sans valeur explicite.
// - SUPABASE_URL vaut par défaut le projet Artemis (Francfort).
// Usage : node scripts/cf-secrets.mjs   (depuis la racine, avec CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';

export const DEFAULT_SUPABASE_URL = 'https://jrlripockeiivegqbeng.supabase.co';
export const PASSTHROUGH = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CONNECTIONS_KEY',
  'RESEND_API_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_BUILDER',
  'STRIPE_PRICE_TEAM',
  'STRIPE_PRICE_AGENCY',
  'STRIPE_PRICE_BUSINESS',
  'STRIPE_METER_OVERAGE',
  'STRIPE_METER_ACTIVE_CLIENT',
];

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Paire VAPID au format web-push : clé publique P-256 non compressée (65 o) et scalaire privé (32 o), en base64url. */
export async function generateVapid() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('raw', kp.publicKey);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64url(pub), privateKey: jwk.d };
}

/** Calcule les secrets à envoyer. `existing` = noms déjà posés sur Cloudflare. */
export async function planSecrets(env, existing) {
  const has = (k) => existing.has(k);
  const out = {};
  const generated = [];
  for (const k of PASSTHROUGH) if (env[k]) out[k] = env[k];
  if (!out.SUPABASE_URL && !has('SUPABASE_URL')) out.SUPABASE_URL = DEFAULT_SUPABASE_URL;
  if (!out.CONNECTIONS_KEY && !has('CONNECTIONS_KEY')) {
    out.CONNECTIONS_KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
    generated.push('CONNECTIONS_KEY');
  }
  const vapidMissing = !(out.VAPID_PUBLIC_KEY || has('VAPID_PUBLIC_KEY')) || !(out.VAPID_PRIVATE_KEY || has('VAPID_PRIVATE_KEY'));
  if (vapidMissing && !env.VAPID_PUBLIC_KEY && !env.VAPID_PRIVATE_KEY) {
    const v = await generateVapid();
    out.VAPID_PUBLIC_KEY = v.publicKey;
    out.VAPID_PRIVATE_KEY = v.privateKey;
    generated.push('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY');
  }
  return { secrets: out, generated };
}

function wrangler(args, opts = {}) {
  return execFileSync('npx', ['wrangler', ...args], { cwd: 'apps/api', encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts });
}

async function main() {
  let existing = new Set();
  try {
    existing = new Set(JSON.parse(wrangler(['secret', 'list', '--format', 'json'])).map((s) => s.name));
  } catch {
    console.log('Aucun secret existant lisible (premier déploiement ?).');
  }
  const { secrets, generated } = await planSecrets(process.env, existing);
  const names = Object.keys(secrets);
  if (!names.length) return console.log('Secrets : rien à mettre à jour.');
  const dir = mkdtempSync(join(tmpdir(), 'artemis-secrets-'));
  const file = join(dir, 'secrets.json');
  try {
    writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
    wrangler(['secret', 'bulk', file], { stdio: ['ignore', 'inherit', 'inherit'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`Secrets posés : ${names.join(', ')}`);
  if (generated.length) console.log(`Générés automatiquement (une seule fois) : ${generated.join(', ')}`);
  const missing = ['SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !secrets[k] && !existing.has(k));
  if (missing.length) console.log(`::warning::Secret manquant : ${missing.join(', ')} — l'API ne peut pas lire la base sans lui.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
