import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import type { PublicConnection } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge, useAction } from '../../components';
import { formatDateTime } from '../../lib/format';

type Provider = 'stripe' | 'qonto' | 'revolut';

const PROVIDERS: Record<Provider, { name: string; fields: { key: string; label: string; hint: string; secret?: boolean; options?: string[] }[]; help: string }> = {
  stripe: {
    name: 'Stripe Issuing',
    help: 'Compte Stripe avec Issuing activé (UE). Créez une clé restreinte avec les droits Issuing en écriture.',
    fields: [{ key: 'secretKey', label: 'Clé secrète restreinte', hint: 'rk_live_… ou sk_test_…', secret: true }],
  },
  qonto: {
    name: 'Qonto',
    help: "Jeton d'accès OAuth obtenu via le programme partenaires Qonto (Business API). La création de carte peut exiger votre validation dans l'app Qonto.",
    fields: [
      { key: 'accessToken', label: "Jeton d'accès", hint: 'Bearer OAuth', secret: true },
      { key: 'refreshToken', label: 'Jeton de rafraîchissement', hint: 'Optionnel', secret: true },
      { key: 'environment', label: 'Environnement', hint: '', options: ['production', 'sandbox'] },
      { key: 'stagingToken', label: 'Staging token', hint: 'Sandbox uniquement', secret: true },
    ],
  },
  revolut: {
    name: 'Revolut Business',
    help: "Plan payant Revolut Business et accès « Cards API » activé par le support Revolut. Jeton d'accès de l'API Business.",
    fields: [
      { key: 'accessToken', label: "Jeton d'accès", hint: 'Business API', secret: true },
      { key: 'environment', label: 'Environnement', hint: '', options: ['production', 'sandbox'] },
    ],
  },
};

function ConnectForm({ onDone }: { onDone: () => void }) {
  const { api } = useOrg();
  const [provider, setProvider] = useState<Provider>('stripe');
  const [values, setValues] = useState<Record<string, string>>({ environment: 'production' });
  const submit = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const credentials = Object.fromEntries(Object.entries(values).filter(([, v]) => v));
    await api('/app/connections', { method: 'POST', body: { provider, credentials } });
    setValues({ environment: 'production' });
    onDone();
  });
  const p = PROVIDERS[provider];
  return (
    <form className="form" onSubmit={(e) => void submit.run(e)}>
      <div className="tabs" role="group" aria-label="Banque">
        {(Object.keys(PROVIDERS) as Provider[]).map((k) => (
          <button key={k} type="button" aria-pressed={provider === k} onClick={() => setProvider(k)}>{PROVIDERS[k].name}</button>
        ))}
      </div>
      <p className="ar-small ar-muted" style={{ margin: 0 }}>{p.help}</p>
      <div className="form-row">
        {p.fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint || undefined}>
            {f.options ? (
              <select className="ar-select" value={values[f.key] ?? f.options[0]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                {f.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input className="ar-input ar-mono" type={f.secret ? 'password' : 'text'} autoComplete="off" value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            )}
          </Field>
        ))}
      </div>
      <p className="ar-small ar-muted" style={{ margin: 0 }}>Les identifiants sont testés puis chiffrés (AES-256-GCM). Ils ne sont plus jamais affichés.</p>
      <ErrorAlert error={submit.error} />
      <div><Button type="submit" disabled={submit.busy}>{submit.busy ? 'Test de la connexion…' : `Connecter ${p.name}`}</Button></div>
    </form>
  );
}

export function Banks() {
  const { api, can, org } = useOrg();
  const { data, error, loading, reload } = useData<{ connections: PublicConnection[] }>('/app/connections');
  const [tested, setTested] = useState<Record<string, string>>({});
  const test = useAction(async (id: string) => {
    const r = await api<{ ok: boolean; detail?: string }>(`/app/connections/${id}/test`, { method: 'POST' });
    setTested((t) => ({ ...t, [id]: r.ok ? 'Connexion OK' : `Échec : ${r.detail ?? ''}` }));
  });
  const remove = useAction(async (id: string) => {
    if (!confirm('Déconnecter cette banque ? Les agents qui l’utilisent ne pourront plus obtenir de carte.')) return;
    await api(`/app/connections/${id}`, { method: 'DELETE' });
    await reload();
  });
  const paid = org?.effective_plan !== 'sandbox';
  return (
    <>
      <PageStage title="Banques" lead="Les cartes sont créées dans votre propre banque. Artemis ne détient jamais vos fonds." />
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        <ErrorAlert error={error ?? test.error ?? remove.error} />
        {loading && !data ? <Loading /> : null}
        <section className="ar-solid">
          <div className="list">
            {data?.connections.map((c) => (
              <div key={c.id} className="list-item">
                <div className="grow">
                  <div>{c.label} <span className="ar-muted ar-small">· {c.provider}</span></div>
                  <div className="sub">Dernière synchro : {formatDateTime(c.last_sync_at)}{tested[c.id] ? ` · ${tested[c.id]}` : ''}</div>
                </div>
                <StatusBadge status={c.status === 'active' ? 'active' : 'failed'} />
                {can('owner', 'admin') ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => void test.run(c.id)}>Tester</Button>
                    {c.provider !== 'sandbox' ? <Button variant="ghost" size="sm" onClick={() => void remove.run(c.id)}>Déconnecter</Button> : null}
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </section>
        {can('owner', 'admin') ? (
          <section className="ar-solid">
            <h2 className="ar-h3" style={{ marginBottom: 12 }}>Connecter une vraie banque</h2>
            {paid ? <ConnectForm onDone={() => void reload()} /> : (
              <div className="alert alert-info">La connexion d'une banque réelle est incluse à partir du plan Builder (19 €/mois). <Link to="/facturation">Choisir un plan →</Link></div>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
