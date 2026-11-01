import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { setupWorld } from '../services/testing';

let w: Awaited<ReturnType<typeof setupWorld>>;
beforeEach(async () => void (w = await setupWorld()));

const rpc = async (method: string, params?: unknown, id: number | null = 1) => {
  const res = await createApp({ store: w.store, now: w.ctx.now }).request('/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify(id === null ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params }),
  }, w.ctx.env);
  return { status: res.status, body: res.status === 202 ? null : ((await res.json()) as any) };
};

describe('MCP', () => {
  it('initializes', async () => {
    const { body } = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    expect(body.result.protocolVersion).toBe('2025-06-18');
    expect(body.result.serverInfo.name).toBe('artemis');
    expect(body.result.capabilities.tools).toBeDefined();
  });
  it('acknowledges notifications with 202', async () => {
    expect((await rpc('notifications/initialized', undefined, null)).status).toBe(202);
  });
  it('lists exactly the seven tools', async () => {
    const { body } = await rpc('tools/list');
    expect(body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(
      ['attach_receipt', 'cancel_card', 'get_card_for_checkout', 'get_request_status', 'get_spend_summary', 'list_budgets', 'request_card'],
    );
    for (const t of body.result.tools) expect(t.inputSchema.type).toBe('object');
  });
  it('request_card creates a pending request', async () => {
    const { body } = await rpc('tools/call', { name: 'request_card', arguments: { amount: 4900, currency: 'EUR', merchant: 'Notion', purpose: 'abonnement' } });
    expect(body.result.isError).toBeFalsy();
    expect(body.result.structuredContent.status).toBe('pending_approval');
  });
  it('get_card_for_checkout before approval is an error result', async () => {
    const created = await rpc('tools/call', { name: 'request_card', arguments: { amount: 4900, merchant: 'Notion', purpose: 'x' } });
    const id = created.body.result.structuredContent.request_id;
    const { body } = await rpc('tools/call', { name: 'get_card_for_checkout', arguments: { request_id: id } });
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/^card_not_ready/);
  });
  it('unknown method returns a JSON-RPC error', async () => {
    const { body } = await rpc('foo/bar');
    expect(body.error.code).toBe(-32601);
  });
  it('requires a token', async () => {
    const res = await createApp({ store: w.store }).request('/mcp', { method: 'POST', body: '{}' }, w.ctx.env);
    expect(res.status).toBe(401);
  });
  it('GET /mcp is not allowed', async () => {
    const res = await createApp({ store: w.store }).request('/mcp', { method: 'GET', headers: { Authorization: `Bearer ${w.token}` } }, w.ctx.env);
    expect(res.status).toBe(405);
  });
});
