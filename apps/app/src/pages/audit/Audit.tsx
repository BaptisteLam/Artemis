import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import type { AuditRow } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, useAction } from '../../components';
import { formatDateTime } from '../../lib/format';
import { API_URL } from '../../lib/config';
import { useAuth } from '../../auth/AuthProvider';
import { EN, useI18n } from '../../i18n';

/** Libellé traduit d'un code du journal (`audit.actions.<action>`, `audit.actors.<type>`), sinon le code brut. */
function label(prefix: string, code: string, t: (k: string) => string) {
  const key = `${prefix}.${code}`;
  return key in EN ? t(key) : code;
}

export function Audit() {
  const { org, orgId } = useOrg();
  const { getAuthHeader } = useAuth();
  const { t } = useI18n();
  const [before, setBefore] = useState<number | null>(null);
  const { data, error, loading } = useData<{ entries: AuditRow[] }>(`/app/audit${before ? `?before=${before}` : ''}`);
  const { api } = useOrg();
  const [verify, setVerify] = useState<{ ok: boolean; brokenAt?: number; count: number } | null>(null);
  const check = useAction(async () => setVerify(await api('/app/audit/verify')));
  const exportAll = useAction(async () => {
    const res = await fetch(`${API_URL}/app/audit/export`, { headers: { Authorization: (await getAuthHeader()) ?? '', 'X-Org-Id': orgId ?? '' } });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? t('audit.exportFailed'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = 'artemis-audit-log.json';
    a.click();
  });
  const canExport = org?.limits.auditExport;
  const now = new Date();
  const quarter = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
  const report = useAction(async () => {
    const res = await fetch(`${API_URL}/app/compliance/report?quarter=${quarter}&format=html`, { headers: { Authorization: (await getAuthHeader()) ?? '', 'X-Org-Id': orgId ?? '' } });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? t('audit.reportUnavailable'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = `artemis-oversight-${quarter}.html`;
    a.click();
  });
  return (
    <>
      <PageStage
        title={t('audit.title')}
        lead={t('audit.lead')}
        actions={
          <>
            <Button variant="glass" onClick={() => void check.run()} disabled={check.busy}>{t('audit.verify')}</Button>
            {canExport ? <Button variant="glass" onClick={() => void exportAll.run()}>{t('audit.export')}</Button> : null}
            {canExport ? <Button variant="glass" onClick={() => void report.run()}>{t('audit.report', { quarter })}</Button> : null}
          </>
        }
      />
      <div className="ar-container page-body ar-stack">
        <ErrorAlert error={error ?? check.error ?? exportAll.error ?? report.error} />
        {verify ? (
          <div className={`alert ${verify.ok ? 'alert-info' : 'alert-error'}`}>
            {verify.ok ? t('audit.chainOk', { count: verify.count }) : t('audit.chainBroken', { id: verify.brokenAt ?? '' })}
          </div>
        ) : null}
        {!canExport ? <p className="ar-small ar-muted">{t('audit.exportUpsell')} <Link to="/billing">{t('audit.seePlans')}</Link></p> : null}
        {loading && !data ? <Loading /> : null}
        {data ? (
          <section className="ar-solid ar-table-wrap">
            <table className="ar-table">
              <thead><tr><th>#</th><th>{t('audit.cols.date')}</th><th>{t('audit.cols.event')}</th><th>{t('audit.cols.actor')}</th><th>{t('audit.cols.hash')}</th></tr></thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="ar-mono">{e.id}</td>
                    <td>{formatDateTime(e.created_at)}</td>
                    <td>{label('audit.actions', e.action, t)}{e.action.startsWith('request') || e.action.startsWith('card') ? <> · <Link to={`/requests/${e.subject}`}>{t('audit.view')}</Link></> : null}</td>
                    <td className="ar-small">{label('audit.actors', e.actor_type, t)}</td>
                    <td className="ar-mono" style={{ fontSize: 11 }}>{e.hash.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.entries.length === 100 ? <Button variant="ghost" size="sm" onClick={() => setBefore(data.entries[data.entries.length - 1]!.id)}>{t('audit.older')}</Button> : null}
          </section>
        ) : null}
      </div>
    </>
  );
}
