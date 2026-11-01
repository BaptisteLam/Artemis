import { createMiddleware } from 'hono/factory';
import { ArtemisError, sha256Hex, type ErrorCode } from '@artemis/shared';
import type { MemberRole } from '@artemis/db';
import type { AppEnv } from './types';

/** Authentifie un agent par `Authorization: Bearer art_…`. */
export const agentAuth = createMiddleware<AppEnv>(async (c, next) => {
  const { store, now } = c.var.ctx;
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!/^art_(live|test)_[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new ArtemisError('unauthorized', "Jeton d'agent manquant ou invalide.");
  }
  const agent = await store.getAgentByTokenHash(await sha256Hex(token));
  if (!agent) throw new ArtemisError('unauthorized', "Jeton d'agent manquant ou invalide.");
  const org = await store.getOrganization(agent.org_id);
  if (!org) throw new ArtemisError('unauthorized', "Jeton d'agent manquant ou invalide.");
  if (org.frozen_at) throw new ArtemisError('org_frozen', "L'organisation est gelée.");
  if (agent.status === 'frozen') throw new ArtemisError('agent_frozen', 'Cet agent est gelé.');
  const minute = Math.floor(now().getTime() / 60_000);
  if (!(await store.hitRateLimit(`agent:${agent.id}:${minute}`, 60, 60))) {
    throw new ArtemisError('rate_limited', 'Trop de requêtes : 60 par minute maximum.');
  }
  c.set('agent', agent);
  c.set('org', org);
  c.var.ctx.defer(store.updateAgent(agent.id, { last_used_at: now().toISOString() }));
  await next();
});

/** Identifiant stable dérivé d'un email (mode dev uniquement). */
export async function devUserId(email: string): Promise<string> {
  const h = await sha256Hex(`dev-user:${email.toLowerCase()}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Authentifie un humain : JWT Supabase, ou `Dev <email>` en développement. */
export const userAuth = createMiddleware<AppEnv>(async (c, next) => {
  const { env, fetch } = c.var.ctx;
  const header = c.req.header('Authorization') ?? '';
  const admins = env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  let id: string;
  let email: string;
  if (header.startsWith('Dev ')) {
    if (env.AUTH_MODE !== 'dev' || env.ENVIRONMENT === 'production') {
      throw new ArtemisError('unauthorized', 'Authentification requise.');
    }
    email = header.slice(4).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new ArtemisError('unauthorized', 'Authentification requise.');
    id = await devUserId(email);
  } else if (header.startsWith('Bearer ')) {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: header, apikey: env.SUPABASE_SERVICE_ROLE_KEY },
    });
    if (!res.ok) throw new ArtemisError('unauthorized', 'Session expirée. Reconnectez-vous.');
    const u = (await res.json()) as { id: string; email?: string };
    id = u.id;
    email = (u.email ?? '').toLowerCase();
  } else {
    throw new ArtemisError('unauthorized', 'Authentification requise.');
  }
  c.set('user', { id, email, isAdmin: admins.includes(email) });
  await next();
});

const ROLE_ERROR: ErrorCode = 'forbidden';

/** Charge l'organisation de l'en-tête `X-Org-Id` et vérifie le rôle de l'utilisateur. */
export function requireRole(...roles: MemberRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const orgId = c.req.header('X-Org-Id') ?? '';
    const user = c.var.user;
    const membership = orgId ? await c.var.ctx.store.getMembership(orgId, user.id) : null;
    if (!membership) throw new ArtemisError(ROLE_ERROR, "Vous n'êtes pas membre de cette organisation.");
    if (roles.length && !roles.includes(membership.role)) {
      throw new ArtemisError(ROLE_ERROR, "Votre rôle ne permet pas cette action.");
    }
    const org = await c.var.ctx.store.getOrganization(orgId);
    if (!org) throw new ArtemisError('not_found', 'Organisation introuvable.');
    c.set('membership', membership);
    c.set('org', org);
    await next();
  });
}

export const ANY_ROLE: MemberRole[] = ['owner', 'admin', 'approver', 'viewer'];
export const MANAGERS: MemberRole[] = ['owner', 'admin'];
export const APPROVERS: MemberRole[] = ['owner', 'admin', 'approver'];
