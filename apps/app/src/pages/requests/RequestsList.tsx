import { Link, useSearchParams } from 'react-router-dom';
import { Amount, EmptyState, MerchantTile } from '@artemis/ui';
import { useData } from '../../lib/useData';
import type { RequestWithAgent } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge } from '../../components';
import { relativeTime } from '../../lib/format';

const FILTERS = [
  ['', 'Toutes'],
  ['pending', 'À valider'],
  ['issued', 'Carte émise'],
  ['completed', 'Payées'],
  ['rejected', 'Refusées'],
  ['failed', 'Échecs'],
] as const;

export function RequestsList() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const agent = params.get('agent') ?? '';
  const q = new URLSearchParams();
  if (status) q.set('status', status);
  if (agent) q.set('agent_id', agent);
  const { data, error, loading } = useData<{ requests: RequestWithAgent[] }>(`/app/requests?${q}`);
  return (
    <>
      <PageStage title="Demandes" lead="Chaque demande d'agent, avec sa décision et sa carte." />
      <div className="ar-container page-body">
        <div className="tabs" role="group" aria-label="Filtrer par statut">
          {FILTERS.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={status === v} onClick={() => setParams(v ? { status: v } : {})}>{l}</button>
          ))}
        </div>
        <ErrorAlert error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <section className="ar-solid">
            {data.requests.length === 0 ? <EmptyState title="Aucune demande">Les demandes de vos agents apparaîtront ici.</EmptyState> : (
              <div className="list">
                {data.requests.map((r) => (
                  <Link key={r.id} to={`/requests/${r.id}`} className="list-item">
                    <MerchantTile name={r.merchant} />
                    <div className="grow">
                      <div>{r.merchant} <span className="ar-muted ar-small">· {r.purpose}</span></div>
                      <div className="sub">{r.agent_name} ↳ {relativeTime(r.created_at)}</div>
                    </div>
                    <Amount cents={Number(r.amount_cents)} currency={r.currency} size="sm" />
                    <StatusBadge status={r.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
