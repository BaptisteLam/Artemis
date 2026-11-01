import { Amount, EmptyState } from '@artemis/ui';
import { useData } from '../../lib/useData';
import type { TransactionRow } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge } from '../../components';
import { formatDateTime } from '../../lib/format';

export function Transactions() {
  const { data, error, loading } = useData<{ transactions: TransactionRow[] }>('/app/transactions');
  const mismatches = data?.transactions.filter((t) => t.match_status === 'mismatch').length ?? 0;
  return (
    <>
      <PageStage title="Transactions" lead="Opérations remontées par vos banques et rapprochées des mandats (90 derniers jours)." />
      <div className="ar-container page-body ar-stack">
        <ErrorAlert error={error} />
        {mismatches > 0 ? <div className="alert alert-error">{mismatches} transaction(s) ne correspondent pas à leur mandat. Vérifiez-les et gelez l'agent si nécessaire.</div> : null}
        {loading && !data ? <Loading /> : null}
        {data ? (
          <section className="ar-solid ar-table-wrap">
            {data.transactions.length === 0 ? <EmptyState title="Aucune transaction">Elles apparaissent quelques minutes après chaque paiement.</EmptyState> : (
              <table className="ar-table">
                <thead><tr><th>Date</th><th>Marchand</th><th>Montant</th><th>Statut banque</th><th>Rapprochement</th></tr></thead>
                <tbody>
                  {data.transactions.map((t) => (
                    <tr key={t.id}>
                      <td>{formatDateTime(t.occurred_at)}</td>
                      <td>{t.merchant_name}</td>
                      <td><Amount cents={-Number(t.amount_cents)} currency={t.currency} size="sm" /></td>
                      <td className="ar-small">{t.status}</td>
                      <td><StatusBadge status={t.match_status} /></td>
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
