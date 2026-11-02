import { Glass } from '@artemis/ui';
import { formatAmount } from '../../lib/format';
import { useData } from '../../lib/useData';
import type { OrganizationRow } from '../../lib/types';
import { ErrorAlert, Loading, PageStage } from '../../components';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../i18n';

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
  const { t, number } = useI18n();
  return (
    <>
      <PageStage eyebrow={t('admin.eyebrow')} title={t('admin.title')}>
        <div className="stat-grid">
          <Glass tone="clear"><span className="ar-micro ar-muted">{t('admin.mrr')}</span><div className="ar-amount ar-amount-xl">{s ? formatAmount(s.mrrEur * 100) : '—'}</div></Glass>
          <Glass tone="clear"><span className="ar-micro ar-muted">{t('admin.paying')}</span><div className="ar-amount ar-amount-xl">{s ? number(s.orgs.paying) : '—'}</div><span className="ar-small ar-muted">{t('admin.ofOrgs', { count: s?.orgs.total ?? 0 })}</span></Glass>
          <Glass tone="clear"><span className="ar-micro ar-muted">{t('admin.signups7d')}</span><div className="ar-amount ar-amount-xl">{s ? number(s.signups7d) : '—'}</div></Glass>
          <Glass tone="clear"><span className="ar-micro ar-muted">{t('admin.requests30d')}</span><div className="ar-amount ar-amount-xl">{s ? number(s.requests30d) : '—'}</div></Glass>
        </div>
      </PageStage>
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        <ErrorAlert error={stats.error ?? orgs.error} />
        {stats.loading && !s ? <Loading /> : null}
        {s ? (
          <div className="two-col">
            <section className="ar-solid ar-table-wrap">
              <h2 className="ar-h3" style={{ marginBottom: 12 }}>{t('admin.orgs')}</h2>
              <table className="ar-table">
                <thead><tr><th>{t('admin.cols.name')}</th><th>{t('admin.cols.plan')}</th><th>{t('admin.cols.subscription')}</th><th>{t('admin.cols.created')}</th></tr></thead>
                <tbody>
                  {orgs.data?.organizations.map((o) => (
                    <tr key={o.id}><td>{o.name}</td><td>{o.effective_plan}</td><td className="ar-small">{o.subscription_status ?? '—'}</td><td>{formatDate(o.created_at)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="ar-solid">
              <h2 className="ar-h3" style={{ marginBottom: 12 }}>{t('admin.waitlist', { total: number(s.waitlist.total) })}</h2>
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
