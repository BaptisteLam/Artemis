const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Vérifie l'en-tête Stripe-Signature (HMAC-SHA256 de « t.payload », tolérance 5 min). */
export async function verifyStripeSignature(payload: string, header: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2));
  const t = Number(parts.t);
  const v1s = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !v1s.length || Math.abs(nowSec - t) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return v1s.some((v) => safeEqual(v, expected));
}

/** Produit un en-tête Stripe-Signature valide (tests, outils locaux). */
export async function signStripePayload(payload: string, secret: string, t: number): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${payload}`)}`;
}
