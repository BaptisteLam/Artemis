import { Link } from 'react-router-dom';
import { Amount, Button, EmptyState } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import { ErrorAlert, Loading, PageStage, StatusBadge, useAction } from '../../components';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../i18n';

interface Sub {
  request_id: string;
  last4: string;
  card_status: string;
  merchant: string;
  purpose: string;
  monthly_limit_cents: number;
  currency: string;
  agent: string | null;
  payments: number;
  total_paid_cents: number;
  last_payment_at: string | null;
  dormant: boolean;
}

export function Subscriptions() {
  const { api, can, org } = useOrg();
  const { t } = useI18n();
  const { data, error, loading, reload } = useData<{ subscriptions: Sub[] }>('/app/subscriptions');
  const cancel = useAction(async (id: string) => {
    if (!confirm(t('subscriptions.confirmCancel'))) return;
    await api(`/app/requests/${id}/cancel`, { method: 'POST' });
    await reload();
  });
  const dormant = data?.subscriptions.filter((s) => s.dormant).length ?? 0;
  return (
    <>
      <PageStage title={t('subscriptions.title')} lead={t('subscriptions.lead')} />
      <div className="ar-container page-body ar-stack">
        <ErrorAlert error={error ?? cancel.error} />
        {!org?.limits.subscriptions ? <div className="alert alert-info">{t('subscriptions.planRequired')} <Link to="/billing">{t('subscriptions.seePlans')}</Link></div> : null}
        {dormant > 0 ? <div className="alert alert-warn">{t('subscriptions.dormantAlert', { count: dormant, days: 45 })}</div> : null}
        {loading && !data ? <Loading /> : null}
        {data ? (
          <section className="ar-solid ar-table-wrap">
            {data.subscriptions.length === 0 ? <EmptyState title={t('subscriptions.emptyTitle')}>{t('subscriptions.emptyText')}</EmptyState> : (
              <table className="ar-table">
                <thead><tr><th>{t('subscriptions.colMerchant')}</th><th>{t('subscriptions.colAgent')}</th><th>{t('subscriptions.colMonthlyLimit')}</th><th>{t('subscriptions.colPaid')}</th><th>{t('subscriptions.colLastPayment')}</th><th>{t('subscriptions.colStatus')}</th><th /></tr></thead>
                <tbody>
                  {data.subscriptions.map((s) => (
                    <tr key={s.request_id}>
                      <td><Link to={`/requests/${s.request_id}`}>{s.merchant}</Link><div className="ar-small ar-muted">•••• {s.last4}</div></td>
                      <td className="ar-mono">{s.agent}</td>
                      <td><Amount cents={s.monthly_limit_cents} currency={s.currency} size="sm" /></td>
                      <td><Amount cents={s.total_paid_cents} currency={s.currency} size="sm" /> <span className="ar-small ar-muted">({s.payments})</span></td>
                      <td>{formatDate(s.last_payment_at)}</td>
                      <td>{s.dormant ? <span className="ar-badge ar-badge-pending"><span className="ar-badge-dot" />{t('subscriptions.dormant')}</span> : <StatusBadge status={s.card_status} />}</td>
                      <td>{can('owner', 'admin', 'approver') ? <Button variant="ghost" size="sm" onClick={() => void cancel.run(s.request_id)}>{t('subscriptions.cancel')}</Button> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
