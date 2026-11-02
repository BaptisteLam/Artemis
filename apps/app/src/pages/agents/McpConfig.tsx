import { useState } from 'react';
import { CopyButton } from '../../components';
import { API_URL, MCP_URL } from '../../lib/config';
import { useI18n } from '../../i18n';

type Tab = 'desktop' | 'code' | 'n8n' | 'api';

/** Les extraits de configuration (JSON, commandes) restent en anglais, quelle que soit la langue. */
export function McpConfig({ token, showWarning = true }: { token: string; showWarning?: boolean }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('desktop');
  const snippets: Record<Tab, { label: string; text: string; help: string }> = {
    desktop: {
      label: t('agents.mcp.desktopLabel'),
      help: t('agents.mcp.desktopHelp'),
      text: JSON.stringify({ mcpServers: { artemis: { type: 'http', url: MCP_URL, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
    },
    code: {
      label: t('agents.mcp.codeLabel'),
      help: t('agents.mcp.codeHelp'),
      // i18n-ignore : extrait de configuration (code), identique dans toutes les langues.
      text: `claude mcp add --transport http artemis ${MCP_URL} \\\n  --header "Authorization: Bearer ${token}"`,
    },
    n8n: {
      label: t('agents.mcp.n8nLabel'),
      help: t('agents.mcp.n8nHelp'),
      // i18n-ignore : extrait de configuration (code), identique dans toutes les langues.
      text: `URL: ${MCP_URL}\nHeader: Authorization\nValue: Bearer ${token}`,
    },
    api: {
      label: t('agents.mcp.apiLabel'),
      help: t('agents.mcp.apiHelp'),
      // i18n-ignore : extrait de configuration (code), identique dans toutes les langues.
      text: `curl -X POST ${API_URL}/v1/card-requests \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount":4900,"merchant":"Notion","purpose":"team subscription"}'`,
    },
  };
  const s = snippets[tab];
  return (
    <div className="ar-stack">
      {showWarning ? (
        <div className="alert alert-warn">
          {t('agents.mcp.warning')}
          <div className="token-box" style={{ marginTop: 8 }}>{token}</div>
        </div>
      ) : null}
      <div className="tabs" role="group" aria-label={t('agents.mcp.toolAria')}>
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
