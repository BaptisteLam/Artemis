import { describe, expect, it, vi } from 'vitest';
import { ArtemisError } from '@artemis/shared';
import { SupabaseStore } from './supabase';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

describe('SupabaseStore', () => {
  it('queries PostgREST with service role headers', async () => {
    const f = mockFetch(200, [{ id: 'a1', name: 'x' }]);
    const s = new SupabaseStore('https://p.supabase.co', 'svc', f as unknown as typeof fetch);
    const a = await s.getAgentByTokenHash('abc');
    expect(a?.id).toBe('a1');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://p.supabase.co/rest/v1/agents?select=*&token_hash=eq.abc&limit=1');
    expect((init.headers as Record<string, string>).apikey).toBe('svc');
  });
  it('maps the budget exception to an ArtemisError', async () => {
    const f = mockFetch(400, { code: 'P0001', message: 'over_monthly_budget' });
    const s = new SupabaseStore('https://p.supabase.co', 'svc', f as unknown as typeof fetch);
    const err = await s.createCardRequestAtomic({} as never, 1, new Date()).catch((e) => e);
    expect(err).toBeInstanceOf(ArtemisError);
    expect(err.code).toBe('over_monthly_budget');
  });
  it('updateCardRequest filters on the expected status', async () => {
    const f = mockFetch(200, []);
    const s = new SupabaseStore('https://p.supabase.co', 'svc', f as unknown as typeof fetch);
    expect(await s.updateCardRequest('r1', { status: 'approved' }, 'pending')).toBeNull();
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('status=eq.pending');
  });
});
