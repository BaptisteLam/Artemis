import { beforeEach, describe, expect, it } from 'vitest';
import { generateAgentToken } from '@artemis/shared';
import { createApp } from '../app';
import { MemoryStore } from '../store/memory';
import { TEST_ENV, type Env } from '../env';

let store: MemoryStore;
let token: string;
let agentId: string;

beforeEach(async () => {
  store = new MemoryStore();
  const org = await store.createOrganization({ name: 'Org' });
  const t = await generateAgentToken('test');
  token = t.token;
  agentId = (await store.createAgent({ org_id: org.id, name: 'notion.agent', platform: 'claude', token_hash: t.hash, token_prefix: t.prefix, bank_connection_id: null })).id;
});

const call = (path: string, headers: Record<string, string>, env: Env = TEST_ENV) =>
  createApp({ store }).request(path, { headers }, env);

describe('agent auth', () => {
  it('rejects an unknown token', async () => {
    const res = await call('/v1/me', { Authorization: 'Bearer art_test_nope' });
    expect(res.status).toBe(401);
    expect((await res.json()) as any).toEqual({ error: { code: 'unauthorized', message: expect.any(String) } });
  });
  it('accepts a valid token', async () => {
    const res = await call('/v1/me', { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).agent.name).toBe('notion.agent');
  });
  it('rejects a frozen agent', async () => {
    await store.updateAgent(agentId, { status: 'frozen' });
    const res = await call('/v1/me', { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.code).toBe('agent_frozen');
  });
  it('rate limits after 60 requests per minute', async () => {
    const app = createApp({ store });
    for (let i = 0; i < 60; i++) {
      const r = await app.request('/v1/me', { headers: { Authorization: `Bearer ${token}` } }, TEST_ENV);
      expect(r.status).toBe(200);
    }
    const res = await app.request('/v1/me', { headers: { Authorization: `Bearer ${token}` } }, TEST_ENV);
    expect(res.status).toBe(429);
    expect(((await res.json()) as any).error.code).toBe('rate_limited');
  });
});

describe('user auth', () => {
  it('accepts Dev auth in development', async () => {
    const res = await call('/app/me', { Authorization: 'Dev alice@exemple.fr' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).user.email).toBe('alice@exemple.fr');
  });
  it('refuses Dev auth in production', async () => {
    const res = await call('/app/me', { Authorization: 'Dev alice@exemple.fr' }, { ...TEST_ENV, ENVIRONMENT: 'production' });
    expect(res.status).toBe(401);
  });
  it('requires auth', async () => {
    expect((await call('/app/me', {})).status).toBe(401);
  });
});
