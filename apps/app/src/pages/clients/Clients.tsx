import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Amount, Button, EmptyState, Field } from '@artemis/ui';
import { parseEurosToCents } from '@artemis/shared';
import type { ClientRow } from '@artemis/db';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import { API_URL } from '../../lib/config';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorAlert, Loading, PageStage, useAction } from '../../components';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../i18n';
import { formatMoney } from '@artemis/i18n';
import { PLAN_LIMITS } from '@artemis/shared';

type ClientWithStats = ClientRow & { spent_this_month: number; agents: number };

export function Clients() {
  const { api, can, org } = useOrg();
  const { t, locale, number } = useI18n();
  const { data, error, loading, reload } = useData<{ clients: ClientWithStats[] }>('/app/clients');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [markup, setMarkup] = useState('10');
  const [budget, setBudget] = useState('');
  const create = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const b = budget.trim() ? parseEurosToCents(budget) : null;
    if (budget.trim() && b === null) throw new Error(t('clients.invalidBudget'));
    await api('/app/clients', { method: 'POST', body: { name, billing_email: email || null, markup_pct: Number(markup.replace(',', '.')) || 0, monthly_budget_cents: b } });
    setName('');
    setEmail('');
    setBudget('');
    await reload();
  });
  const allowed = org?.limits.clients !== 0;
  return (
    <>
      <PageStage title={t('clients.title')} lead={t('clients.lead')} />
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        <ErrorAlert error={error} />
        {!allowed ? <div className="alert alert-info">{t('clients.upsell', { price: formatMoney(locale, PLAN_LIMITS.agency.priceEur * 100, 'EUR', { whole: true }), perClient: formatMoney(locale, PLAN_LIMITS.agency.perClientEur * 100, 'EUR', { whole: true }) })} <Link to="/billing">{t('clients.seePlans')}</Link></div> : null}
        {loading && !data ? <Loading /> : null}
        {data ? (
          <section className="ar-solid ar-table-wrap">
            {data.clients.length === 0 ? <EmptyState title={t('clients.empty')}>{t('clients.emptyHint')}</EmptyState> : (
              <table className="ar-table">
                <thead><tr><th>{t('clients.cols.client')}</th><th>{t('clients.cols.agents')}</th><th>{t('clients.cols.spent')}</th><th>{t('clients.cols.budget')}</th><th>{t('clients.cols.markup')}</th><th /></tr></thead>
                <tbody>
                  {data.clients.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/clients/${c.id}`}>{c.name}</Link>{c.status === 'archived' ? <span className="ar-small ar-muted"> · {t('clients.archived')}</span> : null}</td>
                      <td>{c.agents}</td>
                      <td><Amount cents={c.spent_this_month} size="sm" /></td>
                      <td>{c.monthly_budget_cents != null ? <Amount cents={Number(c.monthly_budget_cents)} size="sm" /> : '—'}</td>
                      <td>{t('clients.percent', { value: number(Number(c.markup_pct)) })}</td>
                      <td><Link to={`/clients/${c.id}`}>{t('clients.report')}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : null}
        {allowed && can('owner', 'admin') ? (
          <form className="ar-solid form" onSubmit={(e) => void create.run(e)}>
            <h2 className="ar-h3">{t('clients.new')}</h2>
            <div className="form-row">
              <Field label={t('clients.fields.name')}><input className="ar-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></Field>
              <Field label={t('clients.fields.billingEmail')}><input className="ar-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label={t('clients.fields.markup')}><input className="ar-input" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} /></Field>
              <Field label={t('clients.fields.budget')} hint={t('clients.fields.budgetHint')}><input className="ar-input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
            </div>
            <ErrorAlert error={create.error} />
            <div><Button type="submit" disabled={create.busy || !name.trim()}>{t('clients.create')}</Button></div>
          </form>
        ) : null}
      </div>
    </>
  );
}

interface Report {
  client: { id: string; name: string; billing_email: string | null };
  month: string;
  lines: { date: string; agent: string; merchant: string; purpose: string; amount_cents: number; currency: string; receipt: boolean }[];
  subtotal_cents: number;
  markup_pct: number;
  markup_cents: number;
  total_cents: number;
}

export function ClientDetail() {
  const { id } = useParams();
  const { api, can, orgId } = useOrg();
  const { getAuthHeader } = useAuth();
  const { t, number } = useI18n();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const { data, error, loading, reload } = useData<Report>(`/app/clients/${id}/report?month=${month}`, [month]);
  const archive = useAction(async (status: 'active' | 'archived') => {
    await api(`/app/clients/${id}`, { method: 'PATCH', body: { status } });
    await reload();
  });
  const csv = useAction(async () => {
    const res = await fetch(`${API_URL}/app/clients/${id}/report?month=${month}&format=csv`, { headers: { Authorization: (await getAuthHeader()) ?? '', 'X-Org-Id': orgId ?? '' } });
    if (!res.ok) throw new Error(t('clients.exportFailed'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = `rebilling-${data?.client.name ?? 'client'}-${month}.csv`;
    a.click();
  });
  return (
    <>
      <PageStage eyebrow={t('clients.eyebrow')} title={data?.client.name ?? t('clients.eyebrow')} lead={data?.client.billing_email ?? undefined}
        actions={<><input className="org-select" type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t('clients.month')} /><Button variant="glass" onClick={() => void csv.run()}>{t('clients.exportCsv')}</Button></>}>
        {data ? (
          <div className="stat-grid">
            <div className="ar-glass"><span className="ar-micro ar-muted">{t('clients.monthPurchases')}</span><div><Amount cents={data.subtotal_cents} size="xl" /></div></div>
            <div className="ar-glass"><span className="ar-micro ar-muted">{t('clients.markupPct', { value: t('clients.percent', { value: number(data.markup_pct) }) })}</span><div><Amount cents={data.markup_cents} size="xl" /></div></div>
            <div className="ar-glass"><span className="ar-micro ar-muted">{t('clients.toRebill')}</span><div><Amount cents={data.total_cents} size="xl" /></div></div>
          </div>
        ) : null}
      </PageStage>
      <div className="ar-container page-body ar-stack">
        <ErrorAlert error={error ?? csv.error ?? archive.error} />
        {loading && !data ? <Loading /> : null}
        {data ? (
          <section className="ar-solid ar-table-wrap">
            {data.lines.length === 0 ? <EmptyState title={t('clients.noPurchases')} /> : (
              <table className="ar-table">
                <thead><tr><th>{t('clients.lines.date')}</th><th>{t('clients.lines.agent')}</th><th>{t('clients.lines.merchant')}</th><th>{t('clients.lines.purpose')}</th><th>{t('clients.lines.amount')}</th><th>{t('clients.lines.receipt')}</th></tr></thead>
                <tbody>
                  {data.lines.map((l, i) => (
                    <tr key={i}><td>{formatDate(l.date)}</td><td className="ar-mono">{l.agent}</td><td>{l.merchant}</td><td className="ar-small">{l.purpose}</td><td><Amount cents={l.amount_cents} currency={l.currency} size="sm" /></td><td>{l.receipt ? t('clients.yes') : <span className="ar-muted">{t('clients.missing')}</span>}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : null}
        {can('owner', 'admin') ? (
          <div className="ar-row">
            <Button variant="ghost" size="sm" onClick={() => void archive.run('archived')}>{t('clients.archive')}</Button>
            <Button variant="ghost" size="sm" onClick={() => void archive.run('active')}>{t('clients.reactivate')}</Button>
            <Link className="muted-link" to="/clients">{t('clients.all')}</Link>
          </div>
        ) : null}
      </div>
    </>
  );
}
