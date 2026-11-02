import { Amount, EmptyState } from '@artemis/ui';
import { useData } from '../../lib/useData';
import type { TransactionRow } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge } from '../../components';
import { formatDateTime } from '../../lib/format';
import { useI18n } from '../../i18n';

export function Transactions() {
  const { t } = useI18n();
  const { data, error, loading } = useData<{ transactions: TransactionRow[] }>('/app/transactions');
  const mismatches = data?.transactions.filter((tx) => tx.match_status === 'mismatch').length ?? 0;
  return (
    <>
      <PageStage title={t('transactions.title')} lead={t('transactions.lead')} />
      <div className="ar-container page-body ar-stack">
        <ErrorAlert error={error} />
        {mismatches > 0 ? <div className="alert alert-error">{t('transactions.mismatches', { count: mismatches })}</div> : null}
        {loading && !data ? <Loading /> : null}
        {data ? (
          <section className="ar-solid ar-table-wrap">
            {data.transactions.length === 0 ? <EmptyState title={t('transactions.emptyTitle')}>{t('transactions.emptyText')}</EmptyState> : (
              <table className="ar-table">
                <thead><tr><th>{t('transactions.colDate')}</th><th>{t('transactions.colMerchant')}</th><th>{t('transactions.colAmount')}</th><th>{t('transactions.colBankStatus')}</th><th>{t('transactions.colMatch')}</th></tr></thead>
                <tbody>
                  {data.transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{formatDateTime(tx.occurred_at)}</td>
                      <td>{tx.merchant_name}</td>
                      <td><Amount cents={-Number(tx.amount_cents)} currency={tx.currency} size="sm" /></td>
                      <td className="ar-small">{tx.status}</td>
                      <td><StatusBadge status={tx.match_status} /></td>
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
