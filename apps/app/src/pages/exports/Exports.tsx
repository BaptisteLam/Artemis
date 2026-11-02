import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { ErrorAlert, PageStage, useAction } from '../../components';
import { API_URL } from '../../lib/config';
import { useAuth } from '../../auth/AuthProvider';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function Exports() {
  const { org, orgId } = useOrg();
  const { getAuthHeader } = useAuth();
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(new Date(now.getTime() + 86_400_000)));
  const download = useAction(async (kind: 'csv' | 'fec') => {
    const res = await fetch(`${API_URL}/app/exports/${kind}?from=${from}&to=${to}`, { headers: { Authorization: (await getAuthHeader()) ?? '', 'X-Org-Id': orgId ?? '' } });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? 'Export impossible.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = kind === 'csv' ? `artemis-depenses-${from}-${to}.csv` : `FEC-artemis-${from}-${to}.txt`;
    a.click();
  });
  return (
    <>
      <PageStage title="Exports comptables" lead="Les dépenses débitées par vos banques, prêtes pour Pennylane, votre expert-comptable ou un tableur." />
      <div className="ar-container page-body" style={{ maxWidth: 760 }}>
        <section className="ar-solid form">
          <div className="form-row">
            <Field label="Du"><input className="ar-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Au (exclu)"><input className="ar-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          <ErrorAlert error={download.error} />
          <div className="ar-row">
            <Button onClick={() => void download.run('csv')} disabled={download.busy}>Télécharger le CSV</Button>
            <Button variant="ghost" onClick={() => void download.run('fec')} disabled={download.busy || !org?.limits.fec}>Télécharger le FEC</Button>
          </div>
          <p className="ar-small ar-muted" style={{ margin: 0 }}>
            CSV : séparateur point-virgule, compatible Excel. FEC : 18 colonnes réglementaires, débit 604000 / crédit 512000, importable dans Pennylane.
            {!org?.limits.fec ? <> Le FEC est inclus à partir du plan Team. <Link to="/billing">Voir les plans</Link></> : null}
          </p>
        </section>
      </div>
    </>
  );
}
