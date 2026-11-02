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

const ACTIONS: Record<string, string> = {
  'org.created': 'Organisation créée',
  'agent.created': 'Agent créé',
  'agent.updated': 'Agent modifié',
  'agent.deleted': 'Agent supprimé',
  'agent.token_rotated': 'Jeton régénéré',
  'agent.frozen': 'Agent gelé',
  'policy.updated': 'Règles modifiées',
  'request.created': 'Demande créée',
  'request.rejected': 'Demande refusée',
  'request.approved': 'Mandat signé',
  'request.auto_approved': 'Validation automatique',
  'request.expired': 'Demande expirée',
  'card.issued': 'Carte émise',
  'card.issue_failed': 'Échec d’émission',
  'card.revealed': "Carte remise à l'agent",
  'card.canceled': 'Carte annulée',
  'card.expired': 'Carte expirée',
  'transaction.matched': 'Transaction rapprochée',
  'transaction.mismatch': 'Écart détecté',
  'receipt.attached': 'Justificatif ajouté',
  'bank.connected': 'Banque connectée',
  'bank.disconnected': 'Banque déconnectée',
  'member.invited': 'Membre invité',
  'member.joined': 'Membre arrivé',
  'member.removed': 'Membre retiré',
  'member.role_changed': 'Rôle modifié',
  'org.frozen': 'Organisation gelée',
  'org.unfrozen': 'Organisation dégelée',
};

export function Audit() {
  const { org, orgId } = useOrg();
  const { getAuthHeader } = useAuth();
  const [before, setBefore] = useState<number | null>(null);
  const { data, error, loading } = useData<{ entries: AuditRow[] }>(`/app/audit${before ? `?before=${before}` : ''}`);
  const { api } = useOrg();
  const [verify, setVerify] = useState<{ ok: boolean; brokenAt?: number; count: number } | null>(null);
  const check = useAction(async () => setVerify(await api('/app/audit/verify')));
  const exportAll = useAction(async () => {
    const res = await fetch(`${API_URL}/app/audit/export`, { headers: { Authorization: (await getAuthHeader()) ?? '', 'X-Org-Id': orgId ?? '' } });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? 'Export impossible.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = 'artemis-journal.json';
    a.click();
  });
  const canExport = org?.limits.auditExport;
  const now = new Date();
  const quarter = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
  const report = useAction(async () => {
    const res = await fetch(`${API_URL}/app/compliance/report?quarter=${quarter}&format=html`, { headers: { Authorization: (await getAuthHeader()) ?? '', 'X-Org-Id': orgId ?? '' } });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? 'Rapport indisponible.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = `artemis-supervision-${quarter}.html`;
    a.click();
  });
  return (
    <>
      <PageStage
        title="Journal d'audit"
        lead="Chaque événement est chaîné par hachage SHA-256 et ne peut être ni modifié ni supprimé : c'est votre preuve de supervision humaine (AI Act)."
        actions={
          <>
            <Button variant="glass" onClick={() => void check.run()} disabled={check.busy}>Vérifier l'intégrité</Button>
            {canExport ? <Button variant="glass" onClick={() => void exportAll.run()}>Exporter</Button> : null}
            {canExport ? <Button variant="glass" onClick={() => void report.run()}>Rapport AI Act {quarter}</Button> : null}
          </>
        }
      />
      <div className="ar-container page-body ar-stack">
        <ErrorAlert error={error ?? check.error ?? exportAll.error ?? report.error} />
        {verify ? (
          <div className={`alert ${verify.ok ? 'alert-info' : 'alert-error'}`}>
            {verify.ok ? `Chaîne intègre : ${verify.count} entrées vérifiées.` : `Chaîne rompue à l'entrée n° ${verify.brokenAt}.`}
          </div>
        ) : null}
        {!canExport ? <p className="ar-small ar-muted">L'export signé du journal est inclus dans le plan Business. <Link to="/facturation">Voir les plans</Link></p> : null}
        {loading && !data ? <Loading /> : null}
        {data ? (
          <section className="ar-solid ar-table-wrap">
            <table className="ar-table">
              <thead><tr><th>#</th><th>Date</th><th>Événement</th><th>Acteur</th><th>Empreinte</th></tr></thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="ar-mono">{e.id}</td>
                    <td>{formatDateTime(e.created_at)}</td>
                    <td>{ACTIONS[e.action] ?? e.action}{e.action.startsWith('request') || e.action.startsWith('card') ? <> · <Link to={`/demandes/${e.subject}`}>voir</Link></> : null}</td>
                    <td className="ar-small">{e.actor_type}</td>
                    <td className="ar-mono" style={{ fontSize: 11 }}>{e.hash.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.entries.length === 100 ? <Button variant="ghost" size="sm" onClick={() => setBefore(data.entries[data.entries.length - 1]!.id)}>Plus ancien →</Button> : null}
          </section>
        ) : null}
      </div>
    </>
  );
}
