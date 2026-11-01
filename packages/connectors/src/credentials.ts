import { fromBase64Url, toBase64Url } from '@artemis/shared';

const enc = new TextEncoder();
const dec = new TextDecoder();

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = fromBase64Url(keyB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  if (raw.length !== 32) throw new Error('CONNECTIONS_KEY must be 32 bytes (base64)');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Génère une clé AES-256 encodée en base64url (à stocker dans CONNECTIONS_KEY). */
export function generateConnectionsKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function encryptCredentials(plain: unknown, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(plain)));
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ct))}`;
}

export async function decryptCredentials<T>(cipher: string, keyB64: string): Promise<T> {
  const [v, ivB64, ctB64] = cipher.split('.');
  if (v !== 'v1' || !ivB64 || !ctB64) throw new Error('invalid ciphertext');
  const key = await importKey(keyB64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(ivB64) }, key, fromBase64Url(ctB64));
  return JSON.parse(dec.decode(pt)) as T;
}
