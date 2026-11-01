import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { MemoryStore } from '../store/memory';
import { TEST_ENV } from '../env';

const get = (store: MemoryStore, path: string, email: string) =>
  createApp({ store }).request(path, { headers: { Authorization: `Dev ${email}` } }, TEST_ENV);

describe('admin', () => {
  it('is reserved to ADMIN_EMAILS', async () => {
    const store = new MemoryStore();
    expect((await get(store, '/admin/stats', 'alice@exemple.fr')).status).toBe(403);
    expect((await get(store, '/admin/stats', 'admin@exemple.fr')).status).toBe(200);
  });
  it('computes MRR from active subscriptions only', async () => {
    const store = new MemoryStore();
    const a = await store.createOrganization({ name: 'A' });
    const b = await store.createOrganization({ name: 'B' });
    const c = await store.createOrganization({ name: 'C' });
    await store.updateOrganization(a.id, { plan: 'team', subscription_status: 'active' });
    await store.updateOrganization(b.id, { plan: 'builder', subscription_status: 'active' });
    await store.updateOrganization(c.id, { plan: 'business', subscription_status: 'past_due' });
    await store.waitlistAdd({ email: 'x@y.fr' });
    const s = (await (await get(store, '/admin/stats', 'admin@exemple.fr')).json()) as any;
    expect(s.mrrEur).toBe(128);
    expect(s.orgs.total).toBe(3);
    expect(s.orgs.byPlan).toMatchObject({ team: 1, builder: 1, business: 1 });
    expect(s.waitlist.total).toBe(1);
    const list = (await (await get(store, '/admin/orgs', 'admin@exemple.fr')).json()) as any;
    expect(list.organizations).toHaveLength(3);
  });
});
