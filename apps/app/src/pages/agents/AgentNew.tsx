import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import type { PublicAgent, PublicConnection } from '../../lib/types';
import { ErrorAlert, PageStage, useAction } from '../../components';
import { McpConfig } from './McpConfig';

export const PLATFORMS = [
  ['claude', 'Claude'],
  ['chatgpt', 'ChatGPT'],
  ['n8n', 'n8n'],
  ['make', 'Make'],
  ['api', 'Code / API'],
  ['other', 'Autre'],
] as const;

export function AgentNew() {
  const { api } = useOrg();
  const conns = useData<{ connections: PublicConnection[] }>('/app/connections');
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('claude');
  const [conn, setConn] = useState('');
  const [created, setCreated] = useState<{ agent: PublicAgent; token: string } | null>(null);
  const create = useAction(async (e: FormEvent) => {
    e.preventDefault();
    setCreated(await api('/app/agents', { method: 'POST', body: { name, platform, bank_connection_id: conn || undefined } }));
  });
  return (
    <>
      <PageStage title={created ? `${created.agent.name} est prêt` : 'Nouvel agent'} lead={created ? 'Branchez-le maintenant, puis ajustez ses règles.' : 'Il recevra un jeton secret et les règles par défaut.'} />
      <div className="ar-container page-body" style={{ maxWidth: 760 }}>
        {created ? (
          <div className="ar-solid ar-stack">
            <McpConfig token={created.token} />
            <div className="ar-row">
              <Link className="ar-btn ar-btn-primary" to={`/agents/${created.agent.id}`}>Régler ses limites →</Link>
              <Link className="ar-btn ar-btn-ghost" to="/agents">Retour aux agents</Link>
            </div>
          </div>
        ) : (
          <form className="ar-solid form" onSubmit={(e) => void create.run(e)}>
            <div className="form-row">
              <Field label="Nom" hint="Ex. notion.agent, cloud.agent">
                <input className="ar-input ar-mono" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
              </Field>
              <Field label="Plateforme">
                <select className="ar-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Banque" hint="Où ses cartes seront créées.">
                <select className="ar-select" value={conn} onChange={(e) => setConn(e.target.value)}>
                  <option value="">Par défaut</option>
                  {conns.data?.connections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
            </div>
            <ErrorAlert error={create.error} />
            <div><Button type="submit" disabled={create.busy || !name.trim()}>Créer l'agent</Button></div>
          </form>
        )}
      </div>
    </>
  );
}
