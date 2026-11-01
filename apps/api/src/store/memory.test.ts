import { describe, expect, it } from 'vitest';
import { ArtemisError } from '@artemis/shared';
import { MemoryStore } from './memory';

async function seed() {
  const s = new MemoryStore();
  const org = await s.createOrganization({ name: 'Org' });
  const agent = await s.createAgent({ org_id: org.id, name: 'a', platform: 'claude', token_hash: 'h', token_prefix: 'art_test_x', bank_connection_id: null });
  return { s, org, agent };
}
const req = (org_id: string, agent_id: string, amount_cents: number) => ({
  org_id, agent_id, amount_cents, currency: 'EUR', merchant: 'Notion', mcc: null, purpose: 'x', card_ttl_minutes: null,
  expires_at: new Date(Date.now() + 60_000).toISOString(),
});

describe('MemoryStore', () => {
  it('updateCardRequest returns null when status differs', async () => {
    const { s, org, agent } = await seed();
    const r = await s.createCardRequestAtomic(req(org.id, agent.id, 100), 1000, new Date(0));
    expect(await s.updateCardRequest(r.id, { status: 'approved' }, 'rejected')).toBeNull();
    expect((await s.updateCardRequest(r.id, { status: 'approved' }, 'pending'))?.status).toBe('approved');
  });
  it('createCardRequestAtomic enforces the budget', async () => {
    const { s, org, agent } = await seed();
    await s.createCardRequestAtomic(req(org.id, agent.id, 600), 1000, new Date(0));
    await expect(s.createCardRequestAtomic(req(org.id, agent.id, 500), 1000, new Date(0))).rejects.toBeInstanceOf(ArtemisError);
  });
  it('markCardRevealed works once', async () => {
    const { s, org, agent } = await seed();
    const r = await s.createCardRequestAtomic(req(org.id, agent.id, 100), 1000, new Date(0));
    const c = await s.createCard({ request_id: r.id, org_id: org.id, bank_connection_id: null, provider_card_id: 'p', last4: '4242', exp_month: 1, exp_year: 2030, status: 'active', expires_at: new Date().toISOString() });
    expect(await s.markCardRevealed(c.id)).not.toBeNull();
    expect(await s.markCardRevealed(c.id)).toBeNull();
  });
  it('audit entries are chained', async () => {
    const { s, org } = await seed();
    const a = await s.appendAudit({ org_id: org.id, actor_type: 'system', actor_id: 'x', action: 'a', subject: 's', data: {}, canonical: '{}' });
    const b = await s.appendAudit({ org_id: org.id, actor_type: 'system', actor_id: 'x', action: 'b', subject: 's', data: {}, canonical: '{"b":1}' });
    expect(b.prev_hash).toBe(a.hash);
  });
  it('rate limit', async () => {
    const s = new MemoryStore();
    for (let i = 0; i < 3; i++) expect(await s.hitRateLimit('k', 60, 3)).toBe(true);
    expect(await s.hitRateLimit('k', 60, 3)).toBe(false);
  });
});
