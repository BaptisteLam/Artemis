import { describe, expect, it } from 'vitest';
import { eurosToCents, parseArgs, runInit, runRequest, type Deps } from './commands';

function deps(over: Partial<Deps> = {}): Deps & { out: string[]; files: Record<string, string>; execs: string[][] } {
  const out: string[] = [];
  const files: Record<string, string> = {};
  const execs: string[][] = [];
  return {
    out, files, execs,
    log: (s: string) => void out.push(s),
    ask: async (_q: string, def?: string) => def ?? '',
    fetch: (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/v1/me')) return new Response(JSON.stringify({ agent: { name: 'notion.agent' }, organization: { name: 'Studio Lumen' } }));
      if (String(url).endsWith('/v1/card-requests')) return new Response(JSON.stringify({ request_id: 'r1', status: 'pending_approval', body: init?.body }), { status: 201 });
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch,
    writeConfig: async (c: unknown) => void (files.config = JSON.stringify(c)),
    readConfig: async () => (files.config ? JSON.parse(files.config) : null),
    hasClaude: async () => true,
    exec: async (cmd: string, args: string[]) => void execs.push([cmd, ...args]),
    ...over,
  };
}

describe('cli', () => {
  it('parses flags', () => {
    expect(parseArgs(['init', '--api', 'https://x', '--yes'])).toEqual({ command: 'init', flags: { api: 'https://x', yes: true } });
  });
  it('converts euros to cents', () => {
    expect(eurosToCents('49,90')).toBe(4990);
    expect(eurosToCents('49.9')).toBe(4990);
    expect(eurosToCents('abc')).toBeNull();
  });
  it('init verifies the token, saves config and registers the MCP server in Claude Code', async () => {
    const d = deps();
    await runInit({ api: 'https://api.test', token: 'art_test_abcdefghijklmnopqrstuvwxyz', yes: true }, d);
    expect(JSON.parse(d.files.config!)).toEqual({ api: 'https://api.test', token: 'art_test_abcdefghijklmnopqrstuvwxyz' });
    expect(d.execs[0]).toEqual(['claude', 'mcp', 'add', '--transport', 'http', 'artemis', 'https://api.test/mcp', '--header', 'Authorization: Bearer art_test_abcdefghijklmnopqrstuvwxyz']);
    expect(d.out.join('\n')).toContain('notion.agent');
  });
  it('init refuses a malformed token', async () => {
    await expect(runInit({ api: 'https://api.test', token: 'nope', yes: true }, deps())).rejects.toThrow(/jeton/i);
  });
  it('request sends cents', async () => {
    const d = deps();
    await d.writeConfig({ api: 'https://api.test', token: 'art_test_abcdefghijklmnopqrstuvwxyz' });
    await runRequest({ amount: '49,00', merchant: 'Notion', purpose: 'abonnement' }, d);
    expect(d.out.join('\n')).toMatch(/pending_approval/);
  });
});
