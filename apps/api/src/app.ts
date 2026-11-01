import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import type { AppEnv } from './http/types';
import { errorResponse } from './http/errors';
import { agentAuth, userAuth } from './http/auth';
import { noopNotifier, type Ctx, type Notifier } from './services/context';
import { MemoryStore } from './store/memory';
import { SupabaseStore } from './store/supabase';
import type { Store } from './store/types';

export interface AppDeps {
  store?: Store;
  now?: () => Date;
  fetch?: typeof fetch;
  notifier?: (ctx: Ctx) => Notifier;
}

let devStore: MemoryStore | null = null;

export function storeFor(env: Env, f: typeof fetch): Store {
  if (env.STORE === 'memory') {
    if (env.ENVIRONMENT === 'production') throw new Error('MemoryStore interdit en production');
    devStore ??= new MemoryStore();
    return devStore;
  }
  return new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, f);
}

export function buildCtx(env: Env, deps: AppDeps, defer: (p: Promise<unknown>) => void): Ctx {
  const f = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const ctx: Ctx = {
    env,
    store: deps.store ?? storeFor(env, f),
    now: deps.now ?? (() => new Date()),
    fetch: f,
    notify: noopNotifier,
    defer,
  };
  ctx.notify = deps.notifier ? deps.notifier(ctx) : noopNotifier;
  return ctx;
}

export function createApp(deps: AppDeps = {}) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const pending: Promise<unknown>[] = [];
    const defer = (p: Promise<unknown>) => {
      const safe = p.catch(() => undefined);
      try {
        c.executionCtx.waitUntil(safe);
      } catch {
        pending.push(safe);
      }
    };
    c.set('ctx', buildCtx(c.env, deps, defer));
    await next();
    if (pending.length) await Promise.all(pending);
  });

  app.use('/app/*', async (c, next) =>
    cors({
      origin: c.env.APP_ORIGIN,
      allowHeaders: ['Authorization', 'Content-Type', 'X-Org-Id'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    })(c, next),
  );
  app.use('/admin/*', async (c, next) =>
    cors({ origin: c.env.APP_ORIGIN, allowHeaders: ['Authorization', 'Content-Type'] })(c, next),
  );

  app.onError((err, c) => errorResponse(c, err));
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Route inconnue.' } }, 404));

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/v1/me', agentAuth, (c) =>
    c.json({ agent: { id: c.var.agent.id, name: c.var.agent.name }, organization: { id: c.var.org.id, name: c.var.org.name } }),
  );

  app.get('/app/me', userAuth, async (c) => {
    const user = c.var.user;
    const memberships = await c.var.ctx.store.listMembershipsForUser(user.id);
    const organizations = await Promise.all(
      memberships.map(async (m) => ({ role: m.role, organization: await c.var.ctx.store.getOrganization(m.org_id) })),
    );
    return c.json({ user, organizations: organizations.filter((o) => o.organization) });
  });

  return app;
}
