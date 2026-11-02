import { Link } from 'react-router-dom';
import { Amount, Button, EmptyState } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import { ErrorAlert, Loading, PageStage, StatusBadge, useAction } from '../../components';
import { formatDate } from '../../lib/format';

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
  const { data, error, loading, reload } = useData<{ subscriptions: Sub[] }>('/app/subscriptions');
  const cancel = useAction(async (id: string) => {
    if (!confirm('Résilier cet abonnement ? La carte sera annulée chez la banque.')) return;
    await api(`/app/requests/${id}/cancel`, { method: 'POST' });
    await reload();
  });
  const dormant = data?.subscriptions.filter((s) => s.dormant).length ?? 0;
  return (
    <>
      <PageStage title="Abonnements" lead="Les abonnements souscrits par vos agents : carte verrouillée sur le marchand, plafond mensuel, détection des abonnements dormants." />
      <div className="ar-container page-body ar-stack">
        <ErrorAlert error={error ?? cancel.error} />
        {!org?.limits.subscriptions ? <div className="alert alert-info">Les abonnements gérés par agent sont inclus à partir du plan Team. <Link to="/billing">Voir les plans →</Link></div> : null}
        {dormant > 0 ? <div className="alert alert-warn">{dormant} abonnement(s) sans paiement depuis plus de 45 jours : pensez à les résilier.</div> : null}
        {loading && !data ? <Loading /> : null}
        {data ? (
          <section className="ar-solid ar-table-wrap">
            {data.subscriptions.length === 0 ? <EmptyState title="Aucun abonnement">Un agent crée un abonnement avec request_card et l'option recurring.</EmptyState> : (
              <table className="ar-table">
                <thead><tr><th>Marchand</th><th>Agent</th><th>Plafond mensuel</th><th>Payé</th><th>Dernier paiement</th><th>Statut</th><th /></tr></thead>
                <tbody>
                  {data.subscriptions.map((s) => (
                    <tr key={s.request_id}>
                      <td><Link to={`/requests/${s.request_id}`}>{s.merchant}</Link><div className="ar-small ar-muted">•••• {s.last4}</div></td>
                      <td className="ar-mono">{s.agent}</td>
                      <td><Amount cents={s.monthly_limit_cents} currency={s.currency} size="sm" /></td>
                      <td><Amount cents={s.total_paid_cents} currency={s.currency} size="sm" /> <span className="ar-small ar-muted">({s.payments})</span></td>
                      <td>{formatDate(s.last_payment_at)}</td>
                      <td>{s.dormant ? <span className="ar-badge ar-badge-pending"><span className="ar-badge-dot" />Dormant</span> : <StatusBadge status={s.card_status} />}</td>
                      <td>{can('owner', 'admin', 'approver') ? <Button variant="ghost" size="sm" onClick={() => void cancel.run(s.request_id)}>Résilier</Button> : null}</td>
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
