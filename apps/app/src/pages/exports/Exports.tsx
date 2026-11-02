import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { ErrorAlert, PageStage, useAction } from '../../components';
import { API_URL } from '../../lib/config';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function Exports() {
  const { org, orgId } = useOrg();
  const { getAuthHeader } = useAuth();
  const { t } = useI18n();
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(new Date(now.getTime() + 86_400_000)));
  const download = useAction(async (kind: 'csv' | 'fec') => {
    const res = await fetch(`${API_URL}/app/exports/${kind}?from=${from}&to=${to}`, { headers: { Authorization: (await getAuthHeader()) ?? '', 'X-Org-Id': orgId ?? '' } });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? t('exports.failed'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = kind === 'csv' ? `artemis-expenses-${from}-${to}.csv` : `FEC-artemis-${from}-${to}.txt`;
    a.click();
  });
  return (
    <>
      <PageStage title={t('exports.title')} lead={t('exports.lead')} />
      <div className="ar-container page-body" style={{ maxWidth: 760 }}>
        <section className="ar-solid form">
          <div className="form-row">
            <Field label={t('exports.from')}><input className="ar-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label={t('exports.to')}><input className="ar-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          <ErrorAlert error={download.error} />
          <div className="ar-row">
            <Button onClick={() => void download.run('csv')} disabled={download.busy}>{t('exports.downloadCsv')}</Button>
            <Button variant="ghost" onClick={() => void download.run('fec')} disabled={download.busy || !org?.limits.fec}>{t('exports.downloadFec')}</Button>
          </div>
          <p className="ar-small ar-muted" style={{ margin: 0 }}>
            {t('exports.formats')}
            {!org?.limits.fec ? <> {t('exports.fecUpsell')} <Link to="/billing">{t('exports.seePlans')}</Link></> : null}
          </p>
        </section>
      </div>
    </>
  );
}
