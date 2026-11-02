import { Glass } from '@artemis/ui';
import { formatAmount } from '../../lib/format';
import { useData } from '../../lib/useData';
import type { OrganizationRow } from '../../lib/types';
import { ErrorAlert, Loading, PageStage } from '../../components';
import { formatDate } from '../../lib/format';

interface Stats {
  orgs: { total: number; byPlan: Record<string, number>; paying: number };
  mrrEur: number;
  signups7d: number;
  waitlist: { total: number; latest: { email: string; company: string | null; use_case: string | null; created_at: string }[] };
  requests30d: number;
}

export function Admin() {
  const stats = useData<Stats>('/admin/stats');
  const orgs = useData<{ organizations: (OrganizationRow & { effective_plan: string })[] }>('/admin/orgs');
  const s = stats.data;
  return (
    <>
      <PageStage eyebrow="Back-office" title="Artemis en chiffres">
        <div className="stat-grid">
          <Glass tone="clear"><span className="ar-micro ar-muted">MRR</span><div className="ar-amount ar-amount-xl">{s ? formatAmount(s.mrrEur * 100) : '—'}</div></Glass>
          <Glass tone="clear"><span className="ar-micro ar-muted">Clients payants</span><div className="ar-amount ar-amount-xl">{s?.orgs.paying ?? '—'}</div><span className="ar-small ar-muted">sur {s?.orgs.total ?? 0} organisations</span></Glass>
          <Glass tone="clear"><span className="ar-micro ar-muted">Inscriptions 7 j</span><div className="ar-amount ar-amount-xl">{s?.signups7d ?? '—'}</div></Glass>
          <Glass tone="clear"><span className="ar-micro ar-muted">Demandes 30 j</span><div className="ar-amount ar-amount-xl">{s?.requests30d ?? '—'}</div></Glass>
        </div>
      </PageStage>
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        <ErrorAlert error={stats.error ?? orgs.error} />
        {stats.loading && !s ? <Loading /> : null}
        {s ? (
          <div className="two-col">
            <section className="ar-solid ar-table-wrap">
              <h2 className="ar-h3" style={{ marginBottom: 12 }}>Organisations</h2>
              <table className="ar-table">
                <thead><tr><th>Nom</th><th>Plan</th><th>Abonnement</th><th>Créée</th></tr></thead>
                <tbody>
                  {orgs.data?.organizations.map((o) => (
                    <tr key={o.id}><td>{o.name}</td><td>{o.effective_plan}</td><td className="ar-small">{o.subscription_status ?? '—'}</td><td>{formatDate(o.created_at)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="ar-solid">
              <h2 className="ar-h3" style={{ marginBottom: 12 }}>Liste d'attente ({s.waitlist.total})</h2>
              <div className="list">
                {s.waitlist.latest.map((w) => (
                  <div key={w.email} className="list-item">
                    <div className="grow"><div>{w.email}</div><div className="sub">{w.company ?? '—'} · {w.use_case ?? ''}</div></div>
                    <span className="ar-small ar-muted">{formatDate(w.created_at)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </>
  );
}
