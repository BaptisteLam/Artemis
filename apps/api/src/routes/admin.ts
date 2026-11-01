import { Hono } from 'hono';
import { ArtemisError, PLAN_LIMITS } from '@artemis/shared';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../http/types';
import { userAuth } from '../http/auth';
import { effectivePlan } from '../services/plan';

const adminOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user.isAdmin) throw new ArtemisError('forbidden', 'Réservé à l’administrateur.');
  await next();
});

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', userAuth, adminOnly);

adminRoutes.get('/stats', async (c) => {
  const { store, now } = c.var.ctx;
  const orgs = await store.listOrganizations({ limit: 100000 });
  const byPlan: Record<string, number> = { sandbox: 0, builder: 0, team: 0, business: 0 };
  let mrrEur = 0;
  for (const o of orgs) {
    byPlan[o.plan] = (byPlan[o.plan] ?? 0) + 1;
    mrrEur += PLAN_LIMITS[effectivePlan(o)].priceEur;
  }
  const weekAgo = new Date(now().getTime() - 7 * 86_400_000);
  return c.json({
    orgs: { total: orgs.length, byPlan, paying: orgs.filter((o) => effectivePlan(o) !== 'sandbox').length },
    mrrEur,
    signups7d: orgs.filter((o) => new Date(o.created_at) >= weekAgo).length,
    waitlist: { total: await store.countWaitlist(), latest: await store.listWaitlist(20) },
    requests30d: await store.countRequestsSince(new Date(now().getTime() - 30 * 86_400_000)),
  });
});

adminRoutes.get('/orgs', async (c) => {
  const offset = Number(c.req.query('offset') ?? 0) || 0;
  const orgs = await c.var.ctx.store.listOrganizations({ limit: 100, offset });
  return c.json({ organizations: orgs.map((o) => ({ ...o, effective_plan: effectivePlan(o) })) });
});
