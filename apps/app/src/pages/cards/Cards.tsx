import { Link } from 'react-router-dom';
import { EmptyState, PayCard } from '@artemis/ui';
import { useData } from '../../lib/useData';
import type { CardRow } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge } from '../../components';
import { formatDateTime, relativeTime, statusLabel } from '../../lib/format';
import { useI18n } from '../../i18n';

export function Cards() {
  const { t } = useI18n();
  const { data, error, loading } = useData<{ cards: CardRow[] }>('/app/cards');
  return (
    <>
      <PageStage title={t('cards.title')} lead={t('cards.lead')} />
      <div className="ar-container page-body">
        <ErrorAlert error={error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <>
          {data.cards.length > 0 ? (
            <div className="paycard-grid">
              {data.cards.slice(0, 6).map((c) => {
                const holder = c.provider_card_id.startsWith('sbx_') ? 'sandbox' : 'agent';
                const exp = `${String(c.exp_month).padStart(2, '0')}/${String(c.exp_year).slice(-2)}`;
                return (
                  <Link key={c.id} to={`/requests/${c.request_id}`} className="paycard-link" aria-label={t('cards.linkAria', { last4: c.last4 })}>
                    <PayCard
                      last4={c.last4}
                      holder={holder}
                      expMonth={c.exp_month}
                      expYear={c.exp_year}
                      state={c.status}
                      variant={c.status === 'active' ? 'cobalt' : 'ink'}
                      tag={c.revealed_at ? t('cards.tagRevealed') : t('cards.tagSingleUse')}
                      stampLabel={statusLabel(c.status).label}
                      ariaLabel={t('cards.cardAria', { last4: c.last4, holder, exp })}
                    />
                  </Link>
                );
              })}
            </div>
          ) : null}
          <section className="ar-solid ar-table-wrap">
            {data.cards.length === 0 ? <EmptyState title={t('cards.emptyTitle')}>{t('cards.emptyText')}</EmptyState> : (
              <table className="ar-table">
                <thead><tr><th>{t('cards.colCard')}</th><th>{t('cards.colIssued')}</th><th>{t('cards.colExpires')}</th><th>{t('cards.colRevealed')}</th><th>{t('cards.colStatus')}</th><th /></tr></thead>
                <tbody>
                  {data.cards.map((c) => (
                    <tr key={c.id}>
                      <td className="ar-mono">•••• {c.last4}</td>
                      <td>{relativeTime(c.created_at)}</td>
                      <td>{formatDateTime(c.expires_at)}</td>
                      <td>{c.revealed_at ? relativeTime(c.revealed_at) : t('cards.notRevealed')}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><Link to={`/requests/${c.request_id}`}>{t('cards.request')}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          </>
        ) : null}
      </div>
    </>
  );
}
