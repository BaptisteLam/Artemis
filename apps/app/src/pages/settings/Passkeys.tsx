import { Button } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import { enrollPasskey, passkeysSupported } from '../../lib/passkeys';
import { ErrorAlert, useAction } from '../../components';
import { formatDate } from '../../lib/format';

export function Passkeys() {
  const { api } = useOrg();
  const { data, reload, error } = useData<{ passkeys: { id: string; name: string | null; created_at: string }[] }>('/app/passkeys');
  const add = useAction(async () => {
    const name = prompt("Nom de l'appareil (ex. iPhone de Léa)") ?? undefined;
    await enrollPasskey(api, name);
    await reload();
  });
  const remove = useAction(async (id: string) => {
    if (!confirm('Supprimer cette passkey ?')) return;
    await api(`/app/passkeys/${id}`, { method: 'DELETE' });
    await reload();
  });
  return (
    <section className="ar-solid ar-stack">
      <div className="panel-title" style={{ margin: 0 }}>
        <h2 className="ar-h3">Passkeys</h2>
        <Button size="sm" onClick={() => void add.run()} disabled={add.busy || !passkeysSupported()}>Ajouter</Button>
      </div>
      <p className="ar-small ar-muted" style={{ margin: 0 }}>Une passkey est requise pour approuver une dépense. Ajoutez-en une sur chaque appareil que vous utilisez.</p>
      <ErrorAlert error={error ?? add.error ?? remove.error} />
      {data?.passkeys.length ? data.passkeys.map((p) => (
        <div key={p.id} className="ar-spread">
          <span>{p.name ?? 'Passkey'} <span className="ar-small ar-muted">· ajoutée le {formatDate(p.created_at)}</span></span>
          <Button variant="ghost" size="sm" onClick={() => void remove.run(p.id)}>Supprimer</Button>
        </div>
      )) : <div className="alert alert-warn">Aucune passkey : vous ne pouvez pas encore approuver de dépenses.</div>}
    </section>
  );
}
