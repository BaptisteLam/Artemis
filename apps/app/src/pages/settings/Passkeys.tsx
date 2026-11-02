import { Button } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import { enrollPasskey, passkeysSupported } from '../../lib/passkeys';
import { ErrorAlert, useAction } from '../../components';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../i18n';

export function Passkeys() {
  const { api } = useOrg();
  const { t } = useI18n();
  const { data, reload, error } = useData<{ passkeys: { id: string; name: string | null; created_at: string }[] }>('/app/passkeys');
  const add = useAction(async () => {
    const name = prompt(t('settings.passkeys.devicePrompt')) ?? undefined;
    await enrollPasskey(api, name);
    await reload();
  });
  const remove = useAction(async (id: string) => {
    if (!confirm(t('settings.passkeys.confirmDelete'))) return;
    await api(`/app/passkeys/${id}`, { method: 'DELETE' });
    await reload();
  });
  return (
    <section className="ar-solid ar-stack">
      <div className="panel-title" style={{ margin: 0 }}>
        <h2 className="ar-h3">{t('settings.passkeys.title')}</h2>
        <Button size="sm" onClick={() => void add.run()} disabled={add.busy || !passkeysSupported()}>{t('settings.passkeys.add')}</Button>
      </div>
      <p className="ar-small ar-muted" style={{ margin: 0 }}>{t('settings.passkeys.lead')}</p>
      <ErrorAlert error={error ?? add.error ?? remove.error} />
      {data?.passkeys.length ? data.passkeys.map((p) => (
        <div key={p.id} className="ar-spread">
          <span>{p.name ?? 'Passkey'} <span className="ar-small ar-muted">· {t('settings.passkeys.addedOn', { date: formatDate(p.created_at) })}</span></span>
          <Button variant="ghost" size="sm" onClick={() => void remove.run(p.id)}>{t('settings.passkeys.delete')}</Button>
        </div>
      )) : <div className="alert alert-warn">{t('settings.passkeys.none')}</div>}
    </section>
  );
}
