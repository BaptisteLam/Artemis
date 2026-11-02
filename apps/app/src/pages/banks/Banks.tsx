import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import type { PublicConnection } from '../../lib/types';
import { ErrorAlert, Loading, PageStage, StatusBadge, useAction } from '../../components';
import { formatDateTime } from '../../lib/format';
import { API_URL } from '../../lib/config';
import { CopyButton } from '../../components';

type Provider = 'stripe' | 'qonto' | 'revolut';

const PROVIDERS: Record<Provider, { name: string; fields: { key: string; label: string; hint: string; secret?: boolean; options?: string[] }[]; help: string }> = {
  stripe: {
    name: 'Stripe Issuing',
    help: "Compte Stripe avec Issuing activé (UE). Créez une clé restreinte avec les droits Issuing en écriture. Indiquez un titulaire existant (ich_…) ou l'adresse de l'entreprise pour qu'Artemis le crée.",
    fields: [
      { key: 'secretKey', label: 'Clé secrète restreinte', hint: 'rk_live_… ou sk_test_…', secret: true },
      { key: 'publishableKey', label: 'Clé publiable', hint: 'pk_live_… (lien éphémère de carte)' },
      { key: 'cardholderId', label: 'Titulaire Stripe', hint: 'ich_… (optionnel)' },
      { key: 'companyName', label: "Nom de l'entreprise", hint: 'Si pas de titulaire' },
      { key: 'billing.line1', label: 'Adresse', hint: 'Si pas de titulaire' },
      { key: 'billing.postal_code', label: 'Code postal', hint: '' },
      { key: 'billing.city', label: 'Ville', hint: '' },
      { key: 'billing.country', label: 'Pays', hint: 'Code ISO, ex. FR' },
      { key: 'webhookSecret', label: 'Secret du webhook', hint: 'whsec_… (après création du webhook, voir ci-dessous)', secret: true },
    ],
  },
  qonto: {
    name: 'Qonto',
    help: "Lecture, gel et rapprochement : Qonto ne transmet pas la carte à un tiers et interdit de la prêter. Jeton OAuth du programme partenaires Qonto ; l'approbateur peut afficher une carte Qonto de façon sécurisée et finaliser le paiement lui-même.",
    fields: [
      { key: 'accessToken', label: "Jeton d'accès", hint: 'Bearer OAuth', secret: true },
      { key: 'refreshToken', label: 'Jeton de rafraîchissement', hint: 'Optionnel', secret: true },
      { key: 'clientId', label: 'Client ID OAuth', hint: 'Pour rafraîchir le jeton' },
      { key: 'clientSecret', label: 'Client secret OAuth', hint: '', secret: true },
      { key: 'holderId', label: 'ID du membre titulaire', hint: 'membership id Qonto' },
      { key: 'bankAccountId', label: 'ID du compte bancaire', hint: 'bank_account id Qonto' },
      { key: 'environment', label: 'Environnement', hint: '', options: ['production', 'sandbox'] },
      { key: 'stagingToken', label: 'Staging token', hint: 'Sandbox uniquement', secret: true },
    ],
  },
  revolut: {
    name: 'Revolut Business',
    help: "Plan Grow ou supérieur, accès « Cards API » activé par le support, et accord écrit de Revolut (Valid Permission) avant toute production. Nécessite la remise directe (Réglages).",
    fields: [
      { key: 'accessToken', label: "Jeton d'accès", hint: 'Business API', secret: true },
      { key: 'refreshToken', label: 'Jeton de rafraîchissement', hint: 'Optionnel', secret: true },
      { key: 'clientAssertion', label: 'Client assertion (JWT)', hint: 'Optionnel, pour le rafraîchissement', secret: true },
      { key: 'holderId', label: 'ID du titulaire', hint: 'Membre de l’équipe (optionnel)' },
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
    const credentials: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (!v || (provider !== 'qonto' && provider !== 'revolut' && k === 'environment')) continue;
      const [head, sub] = k.split('.');
      if (sub) credentials[head!] = { ...((credentials[head!] as Record<string, string>) ?? {}), [sub]: v.trim() };
      else credentials[k] = v.trim();
    }
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
                  {c.provider === 'stripe' ? (
                    <div className="sub" style={{ whiteSpace: 'normal' }}>
                      Webhook Stripe (événements issuing_transaction.*) : {`${API_URL}/webhooks/stripe-issuing/${c.id}`} <CopyButton text={`${API_URL}/webhooks/stripe-issuing/${c.id}`} />
                    </div>
                  ) : null}
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
              <div className="alert alert-info">La connexion d'une banque réelle est incluse à partir du plan Builder (29 €/mois). <Link to="/facturation">Choisir un plan →</Link></div>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
