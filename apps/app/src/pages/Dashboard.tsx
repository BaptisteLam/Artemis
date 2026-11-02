import { Link } from 'react-router-dom';
import { Amount, Glass, MerchantTile } from '@artemis/ui';
import { useOrg } from '../lib/OrgProvider';
import { useData } from '../lib/useData';
import type { Dashboard as DashboardData } from '../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge } from '../components';
import { relativeTime } from '../lib/format';
import { useI18n } from '../i18n';

export function Dashboard() {
  const { org } = useOrg();
  const { t, number } = useI18n();
  const { data, error, loading } = useData<DashboardData>('/app/dashboard');
  const plan = org?.effective_plan ?? 'sandbox';
  const usage = org ? `${number(org.usage.requests)} / ${org.limits.requestsPerMonth === null || !Number.isFinite(org.limits.requestsPerMonth) ? '∞' : number(org.limits.requestsPerMonth)}` : '—';
  const [emptyBefore, emptyAfter = ''] = t('dashboard.recent.empty').split('{agents}');
  return (
    <>
      <PageStage eyebrow={t('dashboard.eyebrow', { org: org?.organization.name ?? '', plan })} title={t('dashboard.title')}>
        <div className="stat-grid">
          <Glass tone="clear">
            <span className="ar-micro ar-muted">{t('dashboard.stats.spent')}</span>
            <div><Amount cents={data?.spent_this_month ?? 0} size="xl" /></div>
          </Glass>
          <Glass tone="clear">
            <span className="ar-micro ar-muted">{t('dashboard.stats.pending')}</span>
            <div className="ar-amount ar-amount-xl">{number(data?.pending_count ?? 0)}</div>
            {data && data.pending_count > 0 ? <Link to="/requests?status=pending" style={{ color: 'inherit' }}>{t('dashboard.stats.openQueue')}</Link> : null}
          </Glass>
          <Glass tone="clear">
            <span className="ar-micro ar-muted">{t('dashboard.stats.requests')}</span>
            <div className="ar-amount ar-amount-xl">{usage}</div>
          </Glass>
        </div>
      </PageStage>
      <div className="ar-container page-body">
        <ErrorAlert error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <div className="two-col">
            <section className="ar-solid">
              <div className="panel-title"><h2 className="ar-h3">{t('dashboard.recent.title')}</h2><Link to="/requests">{t('dashboard.recent.viewAll')}</Link></div>
              {data.recent_requests.length === 0 ? (
                <p className="ar-muted">{emptyBefore}<Link to="/agents">{t('dashboard.recent.agentsLink')}</Link>{emptyAfter}</p>
              ) : (
                <div className="list">
                  {data.recent_requests.map((r) => (
                    <Link key={r.id} to={`/requests/${r.id}`} className="list-item">
                      <MerchantTile name={r.merchant} />
                      <div className="grow">
                        <div>{r.merchant}</div>
                        <div className="sub">{r.agent_name} · {relativeTime(r.created_at)}</div>
                      </div>
                      <Amount cents={Number(r.amount_cents)} currency={r.currency} size="sm" />
                      <StatusBadge status={r.status} />
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <section className="ar-solid">
              <div className="panel-title"><h2 className="ar-h3">{t('dashboard.byAgent.title')}</h2><Link to="/agents">{t('dashboard.byAgent.manage')}</Link></div>
              {data.by_agent.length === 0 ? <p className="ar-muted">{t('dashboard.byAgent.empty')}</p> : (
                <div className="list">
                  {data.by_agent.map((a) => (
                    <Link key={a.id} to={`/agents/${a.id}`} className="list-item">
                      <div className="grow ar-mono">{a.name}</div>
                      {a.status === 'frozen' ? <StatusBadge status="frozen" /> : null}
                      <Amount cents={a.spent} size="sm" />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </>
  );
}
