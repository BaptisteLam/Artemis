import { useState } from 'react';
import { CopyButton } from '../../components';
import { API_URL, MCP_URL } from '../../lib/config';

type Tab = 'desktop' | 'code' | 'n8n' | 'api';

export function McpConfig({ token, showWarning = true }: { token: string; showWarning?: boolean }) {
  const [tab, setTab] = useState<Tab>('desktop');
  const snippets: Record<Tab, { label: string; text: string; help: string }> = {
    desktop: {
      label: 'Claude Desktop',
      help: 'Réglages → Développeur → Modifier la configuration, puis redémarrez Claude.',
      text: JSON.stringify({ mcpServers: { artemis: { type: 'http', url: MCP_URL, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
    },
    code: {
      label: 'Claude Code',
      help: 'Dans un terminal, depuis votre projet.',
      text: `claude mcp add --transport http artemis ${MCP_URL} \\\n  --header "Authorization: Bearer ${token}"`,
    },
    n8n: {
      label: 'n8n',
      help: 'Nœud AI Agent → outil « MCP Client » → HTTP Streamable, authentification Header Auth.',
      text: `URL : ${MCP_URL}\nEn-tête : Authorization\nValeur : Bearer ${token}`,
    },
    api: {
      label: 'API REST',
      help: 'Pour Make, vos scripts ou ChatGPT (connecteur personnalisé).',
      text: `curl -X POST ${API_URL}/v1/card-requests \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount":4900,"merchant":"Notion","purpose":"abonnement équipe"}'`,
    },
  };
  const s = snippets[tab];
  return (
    <div className="ar-stack">
      {showWarning ? (
        <div className="alert alert-warn">
          Copiez ce jeton maintenant : il ne sera plus affiché. Vous pourrez en générer un nouveau à tout moment.
          <div className="token-box" style={{ marginTop: 8 }}>{token}</div>
        </div>
      ) : null}
      <div className="tabs" role="group" aria-label="Outil">
        {(Object.keys(snippets) as Tab[]).map((k) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {snippets[k].label}
          </button>
        ))}
      </div>
      <p className="ar-small ar-muted" style={{ margin: 0 }}>{s.help}</p>
      <div className="code">
        <CopyButton text={s.text} />
        {s.text}
      </div>
    </div>
  );
}
