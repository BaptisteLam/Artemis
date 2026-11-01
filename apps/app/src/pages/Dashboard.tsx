import { Link } from 'react-router-dom';
import { Amount, Glass, MerchantTile } from '@artemis/ui';
import { useOrg } from '../lib/OrgProvider';
import { useData } from '../lib/useData';
import type { Dashboard as DashboardData } from '../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge } from '../components';
import { relativeTime } from '../lib/format';

export function Dashboard() {
  const { org } = useOrg();
  const { data, error, loading } = useData<DashboardData>('/app/dashboard');
  const plan = org?.effective_plan ?? 'sandbox';
  const usage = org ? `${org.usage.requests} / ${org.limits.requestsPerMonth === null || !Number.isFinite(org.limits.requestsPerMonth) ? '∞' : org.limits.requestsPerMonth}` : '—';
  return (
    <>
      <PageStage eyebrow={`${org?.organization.name ?? ''} · plan ${plan}`} title="Tableau de bord">
        <div className="stat-grid">
          <Glass tone="clear">
            <span className="ar-micro ar-muted">Dépensé ce mois</span>
            <div><Amount cents={data?.spent_this_month ?? 0} size="xl" /></div>
          </Glass>
          <Glass tone="clear">
            <span className="ar-micro ar-muted">À valider</span>
            <div className="ar-amount ar-amount-xl">{data?.pending_count ?? 0}</div>
            {data && data.pending_count > 0 ? <Link to="/demandes?status=pending" style={{ color: 'inherit' }}>Ouvrir la file →</Link> : null}
          </Glass>
          <Glass tone="clear">
            <span className="ar-micro ar-muted">Demandes du mois</span>
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
              <div className="panel-title"><h2 className="ar-h3">Dernières demandes</h2><Link to="/demandes">Tout voir →</Link></div>
              {data.recent_requests.length === 0 ? (
                <p className="ar-muted">Aucune demande ce mois-ci. Branchez un agent depuis la page <Link to="/agents">Agents</Link>.</p>
              ) : (
                <div className="list">
                  {data.recent_requests.map((r) => (
                    <Link key={r.id} to={`/demandes/${r.id}`} className="list-item">
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
              <div className="panel-title"><h2 className="ar-h3">Par agent</h2><Link to="/agents">Gérer →</Link></div>
              {data.by_agent.length === 0 ? <p className="ar-muted">Aucun agent.</p> : (
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
