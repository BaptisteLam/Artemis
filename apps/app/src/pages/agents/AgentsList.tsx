import { Link } from 'react-router-dom';
import { Amount, EmptyState } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import type { AgentWithBudget } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge } from '../../components';
import { relativeTime } from '../../lib/format';
import { useI18n } from '../../i18n';

export function AgentsList() {
  const { can } = useOrg();
  const { t } = useI18n();
  const { data, error, loading } = useData<{ agents: AgentWithBudget[] }>('/app/agents');
  return (
    <>
      <PageStage
        title={t('agents.list.title')}
        lead={t('agents.list.lead')}
        actions={can('owner', 'admin') ? <Link className="ar-btn ar-btn-primary" to="/agents/new">{t('agents.list.new')}</Link> : null}
      />
      <div className="ar-container page-body">
        <ErrorAlert error={error} />
        {loading && !data ? <Loading /> : null}
        {data && data.agents.length === 0 ? (
          <div className="ar-solid">
            <EmptyState title={t('agents.list.emptyTitle')} action={can('owner', 'admin') ? <Link className="ar-btn ar-btn-primary" to="/agents/new">{t('agents.list.emptyAction')}</Link> : undefined}>
              {t('agents.list.emptyText')}
            </EmptyState>
          </div>
        ) : null}
        {data && data.agents.length > 0 ? (
          <div className="ar-solid ar-table-wrap">
            <table className="ar-table">
              <thead>
                <tr><th>{t('agents.list.colAgent')}</th><th>{t('agents.list.colPlatform')}</th><th>{t('agents.list.colSpent')}</th><th>{t('agents.list.colRemaining')}</th><th>{t('agents.list.colLastActivity')}</th><th>{t('agents.list.colStatus')}</th></tr>
              </thead>
              <tbody>
                {data.agents.map((a) => (
                  <tr key={a.id}>
                    <td><Link to={`/agents/${a.id}`} className="ar-mono">{a.name}</Link></td>
                    <td>{a.platform}</td>
                    <td>
                      <Amount cents={a.budget.spent} size="sm" /> <span className="ar-muted">/</span> <Amount cents={a.budget.monthly_budget} size="sm" />
                      <div className="meter solid-meter" style={{ marginTop: 6 }}>
                        <i style={{ width: `${Math.min(100, (a.budget.spent / Math.max(1, a.budget.monthly_budget)) * 100)}%` }} />
                      </div>
                    </td>
                    <td><Amount cents={a.budget.remaining} size="sm" /></td>
                    <td className="ar-small ar-muted">{a.last_used_at ? relativeTime(a.last_used_at) : t('agents.list.never')}</td>
                    <td><StatusBadge status={a.status === 'frozen' ? 'frozen' : 'active'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  );
}
