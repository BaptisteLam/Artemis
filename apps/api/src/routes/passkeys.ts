import { Hono } from 'hono';
import { ArtemisError } from '@artemis/shared';
import type { AppEnv } from '../http/types';
import { APPROVERS, requireRole, userAuth } from '../http/auth';
import { mandateAuthenticationOptions, registrationOptions, verifyMandateAssertion, verifyRegistration } from '../services/webauthn';
import { approvalChallenge, approveRequest } from '../services/requests';

export const passkeyRoutes = new Hono<AppEnv>();

passkeyRoutes.use('*', userAuth);

passkeyRoutes.get('/passkeys', async (c) => {
  const list = await c.var.ctx.store.listPasskeys(c.var.user.id);
  return c.json({ passkeys: list.map((p) => ({ id: p.id, name: p.name, created_at: p.created_at })) });
});

passkeyRoutes.post('/passkeys/register/options', async (c) => c.json(await registrationOptions(c.var.ctx, c.var.user)));

passkeyRoutes.post('/passkeys/register/verify', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { response?: unknown; name?: string } | null;
  if (!body?.response) throw new ArtemisError('invalid_input', 'Réponse WebAuthn manquante.');
  const p = await verifyRegistration(c.var.ctx, c.var.user, body.response as never, body.name);
  return c.json({ passkey: { id: p.id, name: p.name, created_at: p.created_at } }, 201);
});

passkeyRoutes.delete('/passkeys/:id', async (c) => {
  await c.var.ctx.store.deletePasskey(c.var.user.id, c.req.param('id'));
  return c.json({ ok: true });
});

passkeyRoutes.post('/requests/:id/approve/options', requireRole(...APPROVERS), async (c) => {
  const { hash } = await approvalChallenge(c.var.ctx, c.var.user, c.var.org.id, c.req.param('id'));
  return c.json({ options: await mandateAuthenticationOptions(c.var.ctx, c.var.user, hash), mandate_hash: hash });
});

passkeyRoutes.post('/requests/:id/approve', requireRole(...APPROVERS), async (c) => {
  const body = (await c.req.json().catch(() => null)) as { response?: unknown } | null;
  if (!body?.response) throw new ArtemisError('invalid_input', 'Assertion WebAuthn manquante.');
  const ctx = c.var.ctx;
  const updated = await approveRequest(ctx, c.var.user, c.var.org.id, c.req.param('id'), (_req, hash) =>
    verifyMandateAssertion(ctx, c.var.user, body.response as never, hash),
  );
  return c.json({ request: updated });
});
