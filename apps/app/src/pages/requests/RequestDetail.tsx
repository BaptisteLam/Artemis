import { useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Amount, Button, Glass, MerchantTile, PayCard, Window } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import type { RequestDetail as Detail } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge, useAction } from '../../components';
import { formatDateTime, relativeTime, statusLabel } from '../../lib/format';
import { DecisionPanel } from './DecisionPanel';
import { API_URL } from '../../lib/config';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';

export function RequestDetail() {
  const { id } = useParams();
  const { api, can, orgId } = useOrg();
  const { getAuthHeader } = useAuth();
  const { t, money } = useI18n();
  const { data, error, loading, reload } = useData<Detail>(`/app/requests/${id}`);
  const fileRef = useRef<HTMLInputElement>(null);
  const simulate = useAction(async () => {
    await api('/app/sandbox/simulate-payment', { method: 'POST', body: { request_id: id } });
    await reload();
  });
  const cancel = useAction(async () => {
    if (!confirm(t('requests.detail.confirmCancel'))) return;
    await api(`/app/requests/${id}/cancel`, { method: 'POST' });
    await reload();
  });
  const upload = useAction(async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    await api(`/app/requests/${id}/receipts`, { method: 'POST', form });
    await reload();
  });
  const secureView = useAction(async (cardId: string) => {
    const { url } = await api<{ url: string }>(`/app/cards/${cardId}/secure-view`);
    window.open(url, '_blank', 'noopener');
  });
  const openReceipt = useAction(async (receiptId: string) => {
    const res = await fetch(`${API_URL}/app/receipts/${receiptId}`, { headers: { Authorization: (await getAuthHeader()) ?? '', 'X-Org-Id': orgId ?? '' } });
    if (!res.ok) throw new Error(t('requests.detail.receiptUnavailable'));
    window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
  });

  if (loading && !data) return <div className="ar-container page-body"><Loading /></div>;
  if (!data) return <div className="ar-container page-body"><ErrorAlert error={error} /></div>;
  const { request: r, agent, mandate, card, receipts, transactions, policy, bank_provider, approvals = [] } = data;
  const required = policy?.approvals_required ?? 1;
  const decider = can('owner', 'admin', 'approver');
  const isSandboxCard = card && card.provider_card_id.startsWith('sbx_');
  const holder = agent?.name ?? t('requests.detail.cardHolderFallback');
  const expMonth = card?.exp_month || 12;
  const expYear = card?.exp_year || 2030;

  return (
    <>
      <PageStage eyebrow={t('requests.detail.eyebrow', { id: r.id.slice(0, 8) })} title={`${r.merchant}`} actions={<StatusBadge status={r.status} />}>
        <div className="stat-grid">
          <Glass tone="clear"><span className="ar-micro ar-muted">{t('requests.detail.amount')}</span><div><Amount cents={Number(r.amount_cents)} currency={r.currency} size="xl" /></div></Glass>
          <Glass tone="clear"><span className="ar-micro ar-muted">{t('requests.detail.agent')}</span><div className="ar-h3 ar-mono">{agent?.name ?? '—'}</div><span className="ar-small ar-muted">{relativeTime(r.created_at)}</span></Glass>
        </div>
      </PageStage>
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        <ErrorAlert error={simulate.error ?? cancel.error ?? upload.error ?? openReceipt.error ?? secureView.error} />
        <div className="two-col">
          <Window title={t('requests.detail.mandateWindow', { id: r.id.slice(0, 8) })}>
            <div className="mandate">
              <div className="ar-row">
                <MerchantTile name={r.merchant} />
                <div className="grow"><strong>{r.merchant}</strong><div className="ar-small ar-muted ar-mono">{agent?.name} ↳ {r.purpose}</div></div>
                <Amount cents={Number(r.amount_cents)} currency={r.currency} />
              </div>
              <dl>
                <dt>{t('requests.detail.purpose')}</dt><dd>{r.purpose}</dd>
                {r.mcc ? <><dt>{t('requests.detail.category')}</dt><dd className="ar-mono">{r.mcc}</dd></> : null}
                <dt>{t('requests.detail.expires')}</dt><dd>{formatDateTime(r.expires_at)}</dd>
                {policy ? <><dt>{t('requests.detail.rules')}</dt><dd>{t('requests.detail.perTxLimit')} <Amount cents={Number(policy.per_tx_limit_cents)} size="sm" /> · {t('requests.detail.budget')} <Amount cents={Number(policy.monthly_budget_cents)} size="sm" /></dd></> : null}
                {r.decision_reason ? <><dt>{t('requests.detail.decision')}</dt><dd>{r.decision_reason}</dd></> : null}
              </dl>
              {r.status === 'pending' && required > 1 ? (
                <div className="alert alert-info ar-small">{t('requests.detail.quorum', { signed: approvals.length, required })}</div>
              ) : null}
              {r.decision_reason?.startsWith('flag:') ? <div className="alert alert-warn ar-small">{t('requests.detail.unusualAmount')}</div> : null}
              {r.status === 'pending' ? (
                <DecisionPanel api={api} requestId={r.id} canDecide={decider} onDone={() => void reload()} />
              ) : mandate ? (
                <div className="alert alert-info ar-small">
                  {mandate.auto_approved ? t('requests.detail.autoApproved') : t('requests.detail.signedByPasskey')} · {formatDateTime(mandate.signed_at)}
                  <div className="ar-mono" style={{ fontSize: 11, overflowWrap: 'anywhere', marginTop: 4 }}>{t('requests.detail.hash', { hash: mandate.payload_hash })}</div>
                </div>
              ) : null}
            </div>
          </Window>
          <div className="ar-stack" style={{ gap: 24 }}>
            <section className="ar-solid ar-stack">
              <h2 className="ar-h3">{t('requests.detail.card')}</h2>
              {card ? (
                <>
                  <PayCard
                    last4={card.last4}
                    holder={holder}
                    expMonth={expMonth}
                    expYear={expYear}
                    state={card.status}
                    variant={card.status === 'active' ? 'cobalt' : 'ink'}
                    tag={`${money(Number(r.amount_cents), r.currency)} · ${r.merchant}`}
                    stampLabel={statusLabel(card.status).label}
                    ariaLabel={t('requests.detail.cardAria', { last4: card.last4, holder, exp: `${String(expMonth).padStart(2, '0')}/${String(expYear).slice(-2)}` })}
                  />
                  <div className="ar-spread">
                    <span className="ar-mono">•••• {card.last4}</span>
                    <StatusBadge status={card.status} />
                  </div>
                  {card.status === 'pending_bank_sca' ? <div className="alert alert-warn">{t('requests.detail.bankSca')}</div> : null}
                  <p className="ar-small ar-muted" style={{ margin: 0 }}>
                    {t('requests.detail.cardExpires', { date: formatDateTime(card.expires_at) })} · {card.revealed_at ? t('requests.detail.handedOver', { time: relativeTime(card.revealed_at) }) : t('requests.detail.notHandedOver')}
                  </p>
                  {bank_provider === 'qonto' ? (
                    <div className="alert alert-info ar-small">{t('requests.detail.qontoNotice')}</div>
                  ) : null}
                  <div className="ar-row">
                    {bank_provider === 'qonto' && card.status === 'active' && decider ? <Button size="sm" onClick={() => void secureView.run(card.id)}>{t('requests.detail.showQontoCard')}</Button> : null}
                    {isSandboxCard && card.status === 'active' && decider ? <Button variant="ghost" size="sm" onClick={() => void simulate.run()}>{t('requests.detail.simulatePayment')}</Button> : null}
                    {['pending', 'approved', 'issued'].includes(r.status) && decider ? <Button variant="ghost" size="sm" onClick={() => void cancel.run()}>{t('requests.detail.cancelCard')}</Button> : null}
                  </div>
                </>
              ) : <p className="ar-muted" style={{ margin: 0 }}>{t('requests.detail.noCard')}</p>}
            </section>
            <section className="ar-solid ar-stack">
              <h2 className="ar-h3">{t('requests.detail.transactions')}</h2>
              {transactions.length ? transactions.map((tx) => (
                <div key={tx.id} className="ar-spread">
                  <span>{tx.merchant_name}</span>
                  <Amount cents={-Number(tx.amount_cents)} currency={tx.currency} size="sm" />
                  <StatusBadge status={tx.match_status} />
                </div>
              )) : <p className="ar-muted" style={{ margin: 0 }}>{t('requests.detail.noTransactions')}</p>}
            </section>
            <section className="ar-solid ar-stack">
              <div className="panel-title" style={{ margin: 0 }}>
                <h2 className="ar-h3">{t('requests.detail.receipts')}</h2>
                {decider ? <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={upload.busy}>{t('requests.detail.addReceipt')}</Button> : null}
              </div>
              <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload.run(f); e.target.value = ''; }} />
              {receipts.length ? receipts.map((rc) => (
                <button key={rc.id} type="button" className="list-item" style={{ border: 0, background: 'none', cursor: 'pointer', textAlign: 'left', padding: '8px 0' }} onClick={() => void openReceipt.run(rc.id)}>
                  <span className="grow">{rc.filename}</span><span className="ar-small ar-muted">{relativeTime(rc.created_at)}</span>
                </button>
              )) : <p className="ar-muted" style={{ margin: 0 }}>{t('requests.detail.noReceipts')}</p>}
            </section>
          </div>
        </div>
        <Link to="/requests" className="muted-link">{t('requests.detail.back')}</Link>
      </div>
    </>
  );
}
