import { Link } from 'react-router-dom';
import { EmptyState } from '@artemis/ui';
import { useData } from '../../lib/useData';
import type { CardRow } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge } from '../../components';
import { formatDateTime, relativeTime } from '../../lib/format';

export function Cards() {
  const { data, error, loading } = useData<{ cards: CardRow[] }>('/app/cards');
  return (
    <>
      <PageStage title="Cartes" lead="Cartes à usage unique émises dans vos banques. Le numéro complet n'est jamais conservé." />
      <div className="ar-container page-body">
        <ErrorAlert error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <section className="ar-solid ar-table-wrap">
            {data.cards.length === 0 ? <EmptyState title="Aucune carte">Les cartes apparaissent après validation d'une demande.</EmptyState> : (
              <table className="ar-table">
                <thead><tr><th>Carte</th><th>Émise</th><th>Expire</th><th>Remise à l'agent</th><th>Statut</th><th /></tr></thead>
                <tbody>
                  {data.cards.map((c) => (
                    <tr key={c.id}>
                      <td className="ar-mono">•••• {c.last4}</td>
                      <td>{relativeTime(c.created_at)}</td>
                      <td>{formatDateTime(c.expires_at)}</td>
                      <td>{c.revealed_at ? relativeTime(c.revealed_at) : 'Non'}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><Link to={`/demandes/${c.request_id}`}>Demande →</Link></td>
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
