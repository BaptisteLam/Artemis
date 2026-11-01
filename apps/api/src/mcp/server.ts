import { Hono } from 'hono';
import { ArtemisError, VERSION } from '@artemis/shared';
import type { AppEnv } from '../http/types';
import { agentAuth } from '../http/auth';
import { safeLog } from '../http/errors';
import { TOOLS } from './tools';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

type RpcRequest = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };

const INSTRUCTIONS =
  "Artemis donne des cartes virtuelles à usage unique, validées par un humain. Pour payer : request_card (montant en centimes) → " +
  'si pending_approval, attendre avec get_request_status → get_card_for_checkout une seule fois au moment de payer → attach_receipt après achat. ' +
  'Ne jamais afficher le numéro de carte.';

/** Serveur MCP sans état (transport HTTP streamable, réponses JSON). */
export const mcp = new Hono<AppEnv>();

mcp.get('/', (c) => c.json({ error: { code: 'invalid_input', message: 'Utilisez POST (transport HTTP streamable).' } }, 405));
mcp.delete('/', (c) => c.body(null, 405));

mcp.post('/', agentAuth, async (c) => {
  let msg: RpcRequest;
  try {
    msg = (await c.req.json()) as RpcRequest;
  } catch {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400);
  }
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return c.body(null, 202);

  const reply = (result: unknown) => c.json({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code: number, message: string) => c.json({ jsonrpc: '2.0', id: msg.id, error: { code, message } });

  switch (msg.method) {
    case 'initialize': {
      const asked = typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : PROTOCOL_VERSIONS[0]!;
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'artemis', title: 'Artemis', version: VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
      });
    case 'tools/call': {
      const name = msg.params?.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Outil inconnu : ${String(name)}`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const out = await tool.run(c.var.ctx, c.var.agent, c.var.org, args);
        return reply({ content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out, isError: false });
      } catch (e) {
        if (e instanceof ArtemisError) {
          return reply({ content: [{ type: 'text', text: `${e.code}: ${e.message}` }], isError: true });
        }
        safeLog('mcp tool', e);
        return reply({ content: [{ type: 'text', text: 'internal: erreur interne, réessayez.' }], isError: true });
      }
    }
    default:
      return fail(-32601, `Méthode inconnue : ${msg.method}`);
  }
});
