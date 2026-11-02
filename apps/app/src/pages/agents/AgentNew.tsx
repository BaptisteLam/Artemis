import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import type { PublicAgent, PublicConnection } from '../../lib/types';
import { ErrorAlert, PageStage, useAction } from '../../components';
import { McpConfig } from './McpConfig';
import { useI18n } from '../../i18n';

/** Plateformes proposées ; libellé : `agents.platforms.<valeur>`. */
export const PLATFORMS = ['claude', 'chatgpt', 'n8n', 'make', 'api', 'other'] as const;

export function AgentNew() {
  const { api } = useOrg();
  const { t } = useI18n();
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
      <PageStage title={created ? t('agents.new.readyTitle', { name: created.agent.name }) : t('agents.new.title')} lead={created ? t('agents.new.readyLead') : t('agents.new.lead')} />
      <div className="ar-container page-body" style={{ maxWidth: 760 }}>
        {created ? (
          <div className="ar-solid ar-stack">
            <McpConfig token={created.token} />
            <div className="ar-row">
              <Link className="ar-btn ar-btn-primary" to={`/agents/${created.agent.id}`}>{t('agents.new.setLimits')}</Link>
              <Link className="ar-btn ar-btn-ghost" to="/agents">{t('agents.new.back')}</Link>
            </div>
          </div>
        ) : (
          <form className="ar-solid form" onSubmit={(e) => void create.run(e)}>
            <div className="form-row">
              <Field label={t('agents.new.name')} hint={t('agents.new.nameHint')}>
                <input className="ar-input ar-mono" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
              </Field>
              <Field label={t('agents.new.platform')}>
                <select className="ar-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {PLATFORMS.map((v) => <option key={v} value={v}>{t(`agents.platforms.${v}`)}</option>)}
                </select>
              </Field>
              <Field label={t('agents.new.bank')} hint={t('agents.new.bankHint')}>
                <select className="ar-select" value={conn} onChange={(e) => setConn(e.target.value)}>
                  <option value="">{t('agents.new.bankDefault')}</option>
                  {conns.data?.connections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
            </div>
            <ErrorAlert error={create.error} />
            <div><Button type="submit" disabled={create.busy || !name.trim()}>{t('agents.new.submit')}</Button></div>
          </form>
        )}
      </div>
    </>
  );
}
