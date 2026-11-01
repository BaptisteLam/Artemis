import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { ArtemisError, fromBase64Url, toBase64Url } from '@artemis/shared';
import type { Ctx, UserInfo } from './context';
import type { MandateSignature } from './requests';

type AuthResponse = Parameters<typeof verifyAuthenticationResponse>[0]['response'];
type RegResponse = Parameters<typeof verifyRegistrationResponse>[0]['response'];
type Transport = NonNullable<NonNullable<Parameters<typeof generateAuthenticationOptions>[0]['allowCredentials']>[number]['transports']>[number];

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Challenge WebAuthn d'un mandat = octets du SHA-256 du mandat, encodés en base64url. */
export function challengeForHash(hash: string): string {
  return toBase64Url(hexToBytes(hash));
}

export async function registrationOptions(ctx: Ctx, user: UserInfo) {
  const existing = await ctx.store.listPasskeys(user.id);
  const options = await generateRegistrationOptions({
    rpName: 'Artemis',
    rpID: ctx.env.WEBAUTHN_RP_ID,
    userName: user.email,
    userDisplayName: user.email,
    userID: new TextEncoder().encode(user.id) as Uint8Array<ArrayBuffer>,
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.credential_id, transports: p.transports as Transport[] })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  await ctx.store.kvSet(`webauthn:reg:${user.id}`, options.challenge, 300);
  return options;
}

export async function verifyRegistration(ctx: Ctx, user: UserInfo, response: RegResponse, name?: string) {
  const challenge = await ctx.store.kvTake<string>(`webauthn:reg:${user.id}`);
  if (!challenge) throw new ArtemisError('invalid_input', "L'enregistrement a expiré : recommencez.");
  let result;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: ctx.env.WEBAUTHN_ORIGIN,
      expectedRPID: ctx.env.WEBAUTHN_RP_ID,
      requireUserVerification: true,
    });
  } catch {
    throw new ArtemisError('invalid_input', 'Passkey refusée par la vérification.');
  }
  if (!result.verified || !result.registrationInfo) throw new ArtemisError('invalid_input', 'Passkey refusée par la vérification.');
  const cred = result.registrationInfo.credential;
  return ctx.store.savePasskey({
    user_id: user.id,
    credential_id: cred.id,
    public_key: toBase64Url(cred.publicKey),
    counter: cred.counter,
    transports: cred.transports ?? [],
    name: name?.slice(0, 60) ?? null,
  });
}

export async function mandateAuthenticationOptions(ctx: Ctx, user: UserInfo, hash: string) {
  const passkeys = await ctx.store.listPasskeys(user.id);
  if (!passkeys.length) throw new ArtemisError('forbidden', 'Enregistrez une passkey pour pouvoir valider des dépenses.');
  return generateAuthenticationOptions({
    rpID: ctx.env.WEBAUTHN_RP_ID,
    challenge: hexToBytes(hash),
    allowCredentials: passkeys.map((p) => ({ id: p.credential_id, transports: p.transports as Transport[] })),
    userVerification: 'required',
  });
}

/** Vérifie que l'assertion signe exactement le mandat `hash`, avec une passkey de l'utilisateur. */
export async function verifyMandateAssertion(ctx: Ctx, user: UserInfo, response: AuthResponse, hash: string): Promise<MandateSignature> {
  const passkey = response?.id ? await ctx.store.getPasskeyByCredentialId(response.id) : null;
  if (!passkey || passkey.user_id !== user.id) throw new ArtemisError('forbidden', 'Passkey inconnue pour cet utilisateur.');
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeForHash(hash),
      expectedOrigin: ctx.env.WEBAUTHN_ORIGIN,
      expectedRPID: ctx.env.WEBAUTHN_RP_ID,
      credential: {
        id: passkey.credential_id,
        publicKey: fromBase64Url(passkey.public_key),
        counter: Number(passkey.counter),
        transports: passkey.transports as Transport[],
      },
      requireUserVerification: true,
    });
  } catch {
    throw new ArtemisError('forbidden', 'Signature de la passkey invalide pour ce mandat.');
  }
  if (!result.verified) throw new ArtemisError('forbidden', 'Signature de la passkey invalide pour ce mandat.');
  await ctx.store.updatePasskeyCounter(passkey.id, result.authenticationInfo.newCounter);
  return {
    passkeyId: passkey.id,
    signature: response.response.signature,
    authenticatorData: response.response.authenticatorData,
    clientDataJSON: response.response.clientDataJSON,
  };
}
