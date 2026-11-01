import { useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Amount, Button, Glass, MerchantTile, Window } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import type { RequestDetail as Detail } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge, useAction } from '../../components';
import { formatDateTime, relativeTime } from '../../lib/format';
import { DecisionPanel } from './DecisionPanel';
import { API_URL } from '../../lib/config';
import { useAuth } from '../../auth/AuthProvider';

export function RequestDetail() {
  const { id } = useParams();
  const { api, can, orgId } = useOrg();
  const { getAuthHeader } = useAuth();
  const { data, error, loading, reload } = useData<Detail>(`/app/requests/${id}`);
  const fileRef = useRef<HTMLInputElement>(null);
  const simulate = useAction(async () => {
    await api('/app/sandbox/simulate-payment', { method: 'POST', body: { request_id: id } });
    await reload();
  });
  const cancel = useAction(async () => {
    if (!confirm('Annuler cette demande et sa carte ?')) return;
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
    if (!res.ok) throw new Error('Justificatif indisponible.');
    window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
  });

  if (loading && !data) return <div className="ar-container page-body"><Loading /></div>;
  if (!data) return <div className="ar-container page-body"><ErrorAlert error={error} /></div>;
  const { request: r, agent, mandate, card, receipts, transactions, policy, bank_provider } = data;
  const decider = can('owner', 'admin', 'approver');
  const isSandboxCard = card && card.provider_card_id.startsWith('sbx_');

  return (
    <>
      <PageStage eyebrow={`Demande · ${r.id.slice(0, 8)}`} title={`${r.merchant}`} actions={<StatusBadge status={r.status} />}>
        <div className="stat-grid">
          <Glass tone="clear"><span className="ar-micro ar-muted">Montant demandé</span><div><Amount cents={Number(r.amount_cents)} currency={r.currency} size="xl" /></div></Glass>
          <Glass tone="clear"><span className="ar-micro ar-muted">Agent</span><div className="ar-h3 ar-mono">{agent?.name ?? '—'}</div><span className="ar-small ar-muted">{relativeTime(r.created_at)}</span></Glass>
        </div>
      </PageStage>
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        <ErrorAlert error={simulate.error ?? cancel.error ?? upload.error ?? openReceipt.error ?? secureView.error} />
        <div className="two-col">
          <Window title={`mandat · ${r.id.slice(0, 8)}`}>
            <div className="mandate">
              <div className="ar-row">
                <MerchantTile name={r.merchant} />
                <div className="grow"><strong>{r.merchant}</strong><div className="ar-small ar-muted ar-mono">{agent?.name} ↳ {r.purpose}</div></div>
                <Amount cents={Number(r.amount_cents)} currency={r.currency} />
              </div>
              <dl>
                <dt>Intention</dt><dd>{r.purpose}</dd>
                {r.mcc ? <><dt>Catégorie</dt><dd className="ar-mono">{r.mcc}</dd></> : null}
                <dt>Expire</dt><dd>{formatDateTime(r.expires_at)}</dd>
                {policy ? <><dt>Règles</dt><dd>Plafond <Amount cents={Number(policy.per_tx_limit_cents)} size="sm" /> · budget <Amount cents={Number(policy.monthly_budget_cents)} size="sm" /></dd></> : null}
                {r.decision_reason ? <><dt>Décision</dt><dd>{r.decision_reason}</dd></> : null}
              </dl>
              {r.status === 'pending' ? (
                <DecisionPanel api={api} requestId={r.id} canDecide={decider} onDone={() => void reload()} />
              ) : mandate ? (
                <div className="alert alert-info ar-small">
                  {mandate.auto_approved ? 'Validée automatiquement par les règles' : 'Mandat signé par passkey'} · {formatDateTime(mandate.signed_at)}
                  <div className="ar-mono" style={{ fontSize: 11, overflowWrap: 'anywhere', marginTop: 4 }}>sha256 {mandate.payload_hash}</div>
                </div>
              ) : null}
            </div>
          </Window>
          <div className="ar-stack" style={{ gap: 24 }}>
            <section className="ar-solid ar-stack">
              <h2 className="ar-h3">Carte</h2>
              {card ? (
                <>
                  <div className="ar-spread">
                    <span className="ar-mono">•••• {card.last4}</span>
                    <StatusBadge status={card.status} />
                  </div>
                  {card.status === 'pending_bank_sca' ? <div className="alert alert-warn">Validez aussi la création de la carte dans votre application bancaire.</div> : null}
                  <p className="ar-small ar-muted" style={{ margin: 0 }}>
                    Expire {formatDateTime(card.expires_at)} · {card.revealed_at ? `remise à l'agent ${relativeTime(card.revealed_at)}` : "pas encore remise à l'agent"}
                  </p>
                  {bank_provider === 'qonto' ? (
                    <div className="alert alert-info ar-small">Qonto ne transmet pas la carte aux agents : affichez-la ici et finalisez le paiement vous-même.</div>
                  ) : null}
                  <div className="ar-row">
                    {bank_provider === 'qonto' && card.status === 'active' && decider ? <Button size="sm" onClick={() => void secureView.run(card.id)}>Afficher la carte (Qonto)</Button> : null}
                    {isSandboxCard && card.status === 'active' && decider ? <Button variant="ghost" size="sm" onClick={() => void simulate.run()}>Simuler un paiement</Button> : null}
                    {['pending', 'approved', 'issued'].includes(r.status) && decider ? <Button variant="ghost" size="sm" onClick={() => void cancel.run()}>Annuler la carte</Button> : null}
                  </div>
                </>
              ) : <p className="ar-muted" style={{ margin: 0 }}>Aucune carte émise.</p>}
            </section>
            <section className="ar-solid ar-stack">
              <h2 className="ar-h3">Transactions</h2>
              {transactions.length ? transactions.map((t) => (
                <div key={t.id} className="ar-spread">
                  <span>{t.merchant_name}</span>
                  <Amount cents={-Number(t.amount_cents)} currency={t.currency} size="sm" />
                  <StatusBadge status={t.match_status} />
                </div>
              )) : <p className="ar-muted" style={{ margin: 0 }}>Aucune transaction remontée par la banque.</p>}
            </section>
            <section className="ar-solid ar-stack">
              <div className="panel-title" style={{ margin: 0 }}>
                <h2 className="ar-h3">Justificatifs</h2>
                {decider ? <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={upload.busy}>Ajouter</Button> : null}
              </div>
              <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload.run(f); e.target.value = ''; }} />
              {receipts.length ? receipts.map((rc) => (
                <button key={rc.id} type="button" className="list-item" style={{ border: 0, background: 'none', cursor: 'pointer', textAlign: 'left', padding: '8px 0' }} onClick={() => void openReceipt.run(rc.id)}>
                  <span className="grow">{rc.filename}</span><span className="ar-small ar-muted">{relativeTime(rc.created_at)}</span>
                </button>
              )) : <p className="ar-muted" style={{ margin: 0 }}>Aucun justificatif.</p>}
            </section>
          </div>
        </div>
        <Link to="/demandes" className="muted-link">← Toutes les demandes</Link>
      </div>
    </>
  );
}
