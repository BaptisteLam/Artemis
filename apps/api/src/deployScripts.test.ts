import { expect, it } from 'vitest';
// @ts-ignore
import { planSecrets, DEFAULT_SUPABASE_URL } from '../../../scripts/cf-secrets.mjs';
import { buildPushPayload } from '@block65/webcrypto-web-push';

it('premier déploiement : génère clé et VAPID, URL par défaut', async () => {
  const { secrets, generated } = await planSecrets({ SUPABASE_SERVICE_ROLE_KEY: 'srk' }, new Set());
  expect(secrets.SUPABASE_URL).toBe(DEFAULT_SUPABASE_URL);
  expect(Buffer.from(secrets.CONNECTIONS_KEY, 'base64').length).toBe(32);
  expect(generated).toEqual(['CONNECTIONS_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']);
  // Les clés doivent être acceptées par la bibliothèque de l'API.
  const sub = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = Buffer.from((await crypto.subtle.exportKey('raw', (sub as CryptoKeyPair).publicKey)) as ArrayBuffer).toString('base64url');
  const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
  const payload = await buildPushPayload({ data: 'x', options: { ttl: 60 } }, { endpoint: 'https://push.example/x', expirationTime: null, keys: { p256dh, auth } }, { subject: 'mailto:a@b.c', publicKey: secrets.VAPID_PUBLIC_KEY, privateKey: secrets.VAPID_PRIVATE_KEY });
  expect(payload.headers.authorization ?? (payload.headers as any).Authorization).toMatch(/vapid/i);
});

it('redéploiement : ne touche à rien de déjà posé', async () => {
  const existing = new Set(['SUPABASE_URL', 'CONNECTIONS_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  const { secrets, generated } = await planSecrets({}, existing);
  expect(secrets).toEqual({});
  expect(generated).toEqual([]);
});

it('valeur explicite : transmise telle quelle', async () => {
  const { secrets } = await planSecrets({ CONNECTIONS_KEY: 'k', STRIPE_SECRET_KEY: 'sk' }, new Set(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SUPABASE_URL']));
  expect(secrets).toEqual({ CONNECTIONS_KEY: 'k', STRIPE_SECRET_KEY: 'sk' });
});
