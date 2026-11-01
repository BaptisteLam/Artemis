import { useEffect, useState } from 'react';
import { Button, Field } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorAlert, PageStage, useAction } from '../../components';
import { Passkeys } from './Passkeys';
import { fromBase64Url } from '@artemis/shared';

function Notifications() {
  const { api } = useOrg();
  const [state, setState] = useState<'unsupported' | 'off' | 'on' | 'denied'>('off');
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    void navigator.serviceWorker.getRegistration().then(async (reg) => setState((await reg?.pushManager.getSubscription()) ? 'on' : 'off'));
  }, []);
  const enable = useAction(async () => {
    const { publicKey } = await api<{ publicKey: string | null }>('/app/push/public-key');
    if (!publicKey) throw new Error("Les notifications push ne sont pas configurées sur ce serveur (clés VAPID). Les emails restent actifs.");
    if ((await Notification.requestPermission()) !== 'granted') return setState('denied');
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) });
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await api('/app/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
    setState('on');
  });
  const disable = useAction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api('/app/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    }
    setState('off');
  });
  return (
    <section className="ar-solid ar-stack">
      <h2 className="ar-h3">Notifications sur cet appareil</h2>
      <p className="ar-small ar-muted" style={{ margin: 0 }}>
        Recevez chaque demande en notification. Sur iPhone, ajoutez d'abord Artemis à l'écran d'accueil (Partager → Sur l'écran d'accueil).
      </p>
      <ErrorAlert error={enable.error ?? disable.error} />
      {state === 'unsupported' ? <div className="alert alert-warn">Ce navigateur ne prend pas en charge les notifications push.</div> : null}
      {state === 'denied' ? <div className="alert alert-warn">Notifications bloquées dans les réglages du navigateur.</div> : null}
      {state === 'off' ? <div><Button onClick={() => void enable.run()} disabled={enable.busy}>Activer les notifications</Button></div> : null}
      {state === 'on' ? <div className="ar-row"><span className="ar-small">Notifications actives.</span><Button variant="ghost" size="sm" onClick={() => void disable.run()}>Désactiver</Button></div> : null}
    </section>
  );
}

export function Settings() {
  const { api, org, can, refresh } = useOrg();
  const { email, signOut } = useAuth();
  const [name, setName] = useState(org?.organization.name ?? '');
  const rename = useAction(async () => {
    await api('/app/org', { method: 'PATCH', body: { name } });
    await refresh();
  });
  const freeze = useAction(async () => {
    if (!confirm('Geler toute l’organisation ? Tous les agents seront gelés et les cartes actives annulées.')) return;
    await api('/app/freeze', { method: 'POST' });
    await refresh();
  });
  const unfreeze = useAction(async () => {
    await api('/app/unfreeze', { method: 'POST' });
    await refresh();
  });
  const frozen = !!org?.organization.frozen_at;
  return (
    <>
      <PageStage title="Réglages" lead={email ?? undefined} />
      <div className="ar-container page-body ar-stack" style={{ gap: 24, maxWidth: 860 }}>
        <Passkeys />
        <Notifications />
        {can('owner', 'admin') ? (
          <section className="ar-solid ar-stack">
            <h2 className="ar-h3">Organisation</h2>
            <div className="form-row" style={{ alignItems: 'end' }}>
              <Field label="Nom"><input className="ar-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
              <div><Button variant="ghost" onClick={() => void rename.run()} disabled={rename.busy || !name.trim()}>Renommer</Button></div>
            </div>
            <ErrorAlert error={rename.error} />
          </section>
        ) : null}
        {can('owner', 'admin') ? (
          <section className="ar-solid ar-stack danger-zone" id="urgence">
            <h2 className="ar-h3">Urgence</h2>
            <p className="ar-small" style={{ margin: 0 }}>
              « Tout geler » suspend tous les agents, annule les cartes actives et les demandes en attente. À utiliser si un agent se comporte anormalement ou si un jeton a fuité.
            </p>
            <ErrorAlert error={freeze.error ?? unfreeze.error} />
            <div className="ar-row">
              {frozen ? (
                <Button onClick={() => void unfreeze.run()} disabled={unfreeze.busy}>Dégeler l'organisation</Button>
              ) : (
                <Button variant="danger" onClick={() => void freeze.run()} disabled={freeze.busy}>Tout geler maintenant</Button>
              )}
            </div>
            {frozen ? <p className="ar-small ar-muted" style={{ margin: 0 }}>Après le dégel, réactivez chaque agent depuis sa page.</p> : null}
          </section>
        ) : null}
        <div><Button variant="ghost" onClick={() => void signOut()}>Se déconnecter</Button></div>
      </div>
    </>
  );
}
