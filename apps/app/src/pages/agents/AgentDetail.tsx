import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Amount, Button, Field } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import type { Budget, PolicyRow, PublicAgent, PublicConnection, RequestWithAgent } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge, useAction } from '../../components';
import { PolicyForm } from './PolicyForm';
import { McpConfig } from './McpConfig';
import { relativeTime } from '../../lib/format';
import { useI18n } from '../../i18n';

export function AgentDetail() {
  const { id } = useParams();
  const { api, can } = useOrg();
  const navigate = useNavigate();
  const { t } = useI18n();
  const manage = can('owner', 'admin');
  const { data, error, loading, reload } = useData<{ agent: PublicAgent; policy: PolicyRow; budget: Budget }>(`/app/agents/${id}`);
  const conns = useData<{ connections: PublicConnection[] }>('/app/connections');
  const reqs = useData<{ requests: RequestWithAgent[] }>(`/app/requests?agent_id=${id}&limit=20`);
  const clients = useData<{ clients: { id: string; name: string; status: string }[] }>('/app/clients');
  const [token, setToken] = useState<string | null>(null);

  const patch = useAction(async (body: Record<string, unknown>) => {
    await api(`/app/agents/${id}`, { method: 'PATCH', body });
    await reload();
  });
  const rotate = useAction(async () => {
    if (!confirm(t('agents.detail.confirmRotate'))) return;
    setToken((await api<{ token: string }>(`/app/agents/${id}/token`, { method: 'POST' })).token);
  });
  const remove = useAction(async () => {
    if (!confirm(t('agents.detail.confirmDelete'))) return;
    await api(`/app/agents/${id}`, { method: 'DELETE' });
    navigate('/agents', { replace: true });
  });

  if (loading && !data) return <div className="ar-container page-body"><Loading /></div>;
  if (!data) return <div className="ar-container page-body"><ErrorAlert error={error} /></div>;
  const { agent, policy, budget } = data;

  return (
    <>
      <PageStage
        eyebrow={`${agent.platform} · ${agent.token_prefix}…`}
        title={agent.name}
        actions={<StatusBadge status={agent.status === 'frozen' ? 'frozen' : 'active'} />}
      >
        <div className="stat-grid">
          <div className="ar-glass"><span className="ar-micro ar-muted">{t('agents.detail.spentThisMonth')}</span><div><Amount cents={budget.spent} size="xl" /></div></div>
          <div className="ar-glass"><span className="ar-micro ar-muted">{t('agents.detail.remaining')}</span><div><Amount cents={budget.remaining} size="xl" /></div></div>
          <div className="ar-glass"><span className="ar-micro ar-muted">{t('agents.detail.perPurchaseLimit')}</span><div><Amount cents={budget.per_transaction_limit} size="xl" /></div></div>
        </div>
      </PageStage>
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        <ErrorAlert error={error ?? patch.error ?? rotate.error ?? remove.error} />
        <div className="two-col">
          <section className="ar-solid">
            <h2 className="ar-h3" style={{ marginBottom: 16 }}>{t('agents.detail.rules')}</h2>
            <PolicyForm
              key={policy.updated_at}
              policy={policy}
              disabled={!manage}
              onSave={async (p) => {
                await api(`/app/agents/${id}/policy`, { method: 'PUT', body: p });
                await reload();
              }}
            />
          </section>
          <div className="ar-stack" style={{ gap: 24 }}>
            <section className="ar-solid ar-stack">
              <h2 className="ar-h3">{t('agents.detail.settings')}</h2>
              <Field label={t('agents.detail.bank')}>
                <select className="ar-select" disabled={!manage} value={agent.bank_connection_id ?? ''} onChange={(e) => void patch.run({ bank_connection_id: e.target.value || null })}>
                  {conns.data?.connections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              {clients.data && clients.data.clients.length > 0 ? (
                <Field label={t('agents.detail.client')}>
                  <select className="ar-select" disabled={!manage} value={agent.client_id ?? ''} onChange={(e) => void patch.run({ client_id: e.target.value || null })}>
                    <option value="">{t('agents.detail.noClient')}</option>
                    {clients.data.clients.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              ) : null}
              {manage ? (
                <div className="ar-row">
                  <Button variant="ghost" onClick={() => void patch.run({ status: agent.status === 'frozen' ? 'active' : 'frozen' })}>
                    {agent.status === 'frozen' ? t('agents.detail.unfreeze') : t('agents.detail.freeze')}
                  </Button>
                  <Button variant="ghost" onClick={() => void rotate.run()}>{t('agents.detail.rotate')}</Button>
                  <Button variant="danger" onClick={() => void remove.run()}>{t('agents.detail.delete')}</Button>
                </div>
              ) : null}
              {token ? <McpConfig token={token} /> : null}
            </section>
            <section className="ar-solid">
              <div className="panel-title"><h2 className="ar-h3">{t('agents.detail.recentRequests')}</h2><Link to={`/requests?agent=${agent.id}`}>{t('agents.detail.seeAll')}</Link></div>
              {reqs.data?.requests.length ? (
                <div className="list">
                  {reqs.data.requests.map((r) => (
                    <Link key={r.id} to={`/requests/${r.id}`} className="list-item">
                      <div className="grow"><div>{r.merchant}</div><div className="sub">{relativeTime(r.created_at)}</div></div>
                      <Amount cents={Number(r.amount_cents)} currency={r.currency} size="sm" />
                      <StatusBadge status={r.status} />
                    </Link>
                  ))}
                </div>
              ) : <p className="ar-muted">{t('agents.detail.noRequests')}</p>}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
