import { Link, useSearchParams } from 'react-router-dom';
import { Amount, EmptyState, MerchantTile } from '@artemis/ui';
import { useData } from '../../lib/useData';
import type { RequestWithAgent } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge } from '../../components';
import { relativeTime } from '../../lib/format';
import { useI18n } from '../../i18n';

const FILTERS = [
  ['', 'requests.filters.all'],
  ['pending', 'requests.filters.pending'],
  ['issued', 'requests.filters.issued'],
  ['completed', 'requests.filters.completed'],
  ['rejected', 'requests.filters.rejected'],
  ['failed', 'requests.filters.failed'],
] as const;

export function RequestsList() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const agent = params.get('agent') ?? '';
  const q = new URLSearchParams();
  if (status) q.set('status', status);
  if (agent) q.set('agent_id', agent);
  const { data, error, loading } = useData<{ requests: RequestWithAgent[] }>(`/app/requests?${q}`);
  return (
    <>
      <PageStage title={t('requests.list.title')} lead={t('requests.list.lead')} />
      <div className="ar-container page-body">
        <div className="tabs" role="group" aria-label={t('requests.filters.aria')}>
          {FILTERS.map(([v, key]) => (
            <button key={v} type="button" aria-pressed={status === v} onClick={() => setParams(v ? { status: v } : {})}>{t(key)}</button>
          ))}
        </div>
        <ErrorAlert error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <section className="ar-solid">
            {data.requests.length === 0 ? <EmptyState title={t('requests.list.emptyTitle')}>{t('requests.list.emptyBody')}</EmptyState> : (
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
