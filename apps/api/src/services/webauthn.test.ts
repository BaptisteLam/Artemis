import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@simplewebauthn/server', async (orig) => {
  const real = await orig<typeof import('@simplewebauthn/server')>();
  return {
    ...real,
    // Vérification simulée : la « signature » est valide si clientDataJSON contient le challenge attendu.
    verifyAuthenticationResponse: vi.fn(async ({ response, expectedChallenge }: { response: { response: { clientDataJSON: string } }; expectedChallenge: string }) => {
      if (!response.response.clientDataJSON.includes(expectedChallenge)) throw new Error('challenge mismatch');
      return { verified: true, authenticationInfo: { newCounter: 7 } };
    }),
  };
});

import { createApp } from '../app';
import { devUserId } from '../http/auth';
import { createCardRequest, mandateHash } from './requests';
import { challengeForHash } from './webauthn';
import { setupWorld } from './testing';

let w: Awaited<ReturnType<typeof setupWorld>>;
let ownerId: string;
const auth = { Authorization: 'Dev boss@exemple.fr' };

beforeEach(async () => {
  w = await setupWorld();
  ownerId = await devUserId('boss@exemple.fr');
  await w.store.addMembership({ org_id: w.org.id, user_id: ownerId, email: 'boss@exemple.fr', role: 'owner' });
  await w.store.savePasskey({ user_id: ownerId, credential_id: 'cred-boss', public_key: 'AAAA', counter: 0, transports: [], name: 'iPhone' });
});

const post = (path: string, body: unknown = {}) =>
  createApp({ store: w.store }).request(path, {
    method: 'POST',
    headers: { ...auth, 'X-Org-Id': w.org.id, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, w.ctx.env);

describe('passkey approval', () => {
  it('approval options use the mandate hash as challenge', async () => {
    const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant: 'Notion', purpose: 'x' });
    const res = await post(`/app/requests/${r.requestId}/approve/options`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { options: { challenge: string }; mandate_hash: string };
    const req = (await w.store.getCardRequest(r.requestId))!;
    const hash = await mandateHash(req, w.agent);
    expect(body.mandate_hash).toBe(hash);
    expect(body.options.challenge).toBe(challengeForHash(hash));
  });

  it('approves with a matching assertion and stores the signature', async () => {
    const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant: 'Notion', purpose: 'x' });
    const hash = await mandateHash((await w.store.getCardRequest(r.requestId))!, w.agent);
    const res = await post(`/app/requests/${r.requestId}/approve`, {
      response: { id: 'cred-boss', response: { clientDataJSON: `cd-${challengeForHash(hash)}`, signature: 'sig', authenticatorData: 'ad' } },
    });
    expect(res.status).toBe(200);
    expect((await w.store.getCardRequest(r.requestId))?.status).toBe('issued');
    expect((await w.store.getMandate(r.requestId))?.signature).toBe('sig');
  });

  it('rejects an assertion over a different challenge', async () => {
    const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant: 'Notion', purpose: 'x' });
    const res = await post(`/app/requests/${r.requestId}/approve`, {
      response: { id: 'cred-boss', response: { clientDataJSON: 'cd-other', signature: 'sig', authenticatorData: 'ad' } },
    });
    expect(res.status).toBe(403);
    expect((await w.store.getCardRequest(r.requestId))?.status).toBe('pending');
  });

  it("rejects another user's passkey", async () => {
    await w.store.savePasskey({ user_id: 'someone-else', credential_id: 'cred-other', public_key: 'AAAA', counter: 0, transports: [], name: null });
    const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant: 'Notion', purpose: 'x' });
    const hash = await mandateHash((await w.store.getCardRequest(r.requestId))!, w.agent);
    const res = await post(`/app/requests/${r.requestId}/approve`, {
      response: { id: 'cred-other', response: { clientDataJSON: `cd-${challengeForHash(hash)}`, signature: 's', authenticatorData: 'a' } },
    });
    expect(res.status).toBe(403);
  });
});
