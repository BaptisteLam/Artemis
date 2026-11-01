import { describe, expect, it, vi } from 'vitest';
import { ArtemisError } from '@artemis/shared';
import { createApiClient } from './api';

describe('api client', () => {
  it('sends auth and org headers', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const api = createApiClient({ baseUrl: 'https://api.test', getAuthHeader: async () => 'Dev a@b.fr', getOrgId: () => 'org-1', fetch: f as unknown as typeof fetch });
    await api('/app/agents');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/app/agents');
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Dev a@b.fr');
    expect(h['X-Org-Id']).toBe('org-1');
  });
  it('turns error payloads into ArtemisError', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'forbidden', message: 'Non' } }), { status: 403 }));
    const api = createApiClient({ baseUrl: '', getAuthHeader: async () => null, getOrgId: () => null, fetch: f as unknown as typeof fetch });
    const err = (await api("/app/x").catch((e) => e)) as any;
    expect(err).toBeInstanceOf(ArtemisError);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('Non');
  });
  it('serialises JSON bodies', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    const api = createApiClient({ baseUrl: '', getAuthHeader: async () => null, getOrgId: () => null, fetch: f as unknown as typeof fetch });
    await api('/app/x', { method: 'POST', body: { a: 1 } });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});
