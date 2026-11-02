import { useEffect, useState } from 'react';
import { Button, Field } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorAlert, PageStage, useAction } from '../../components';
import { Passkeys } from './Passkeys';
import { fromBase64Url } from '@artemis/shared';
import { useI18n } from '../../i18n';
import { LangSelect } from '../../i18n/LangSelect';

function Notifications() {
  const { api } = useOrg();
  const { t } = useI18n();
  const [state, setState] = useState<'unsupported' | 'off' | 'on' | 'denied'>('off');
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    void navigator.serviceWorker.getRegistration().then(async (reg) => setState((await reg?.pushManager.getSubscription()) ? 'on' : 'off'));
  }, []);
  const enable = useAction(async () => {
    const { publicKey } = await api<{ publicKey: string | null }>('/app/push/public-key');
    if (!publicKey) throw new Error(t('settings.notifications.notConfigured'));
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
      <h2 className="ar-h3">{t('settings.notifications.title')}</h2>
      <p className="ar-small ar-muted" style={{ margin: 0 }}>
        {t('settings.notifications.lead')}
      </p>
      <ErrorAlert error={enable.error ?? disable.error} />
      {state === 'unsupported' ? <div className="alert alert-warn">{t('settings.notifications.unsupported')}</div> : null}
      {state === 'denied' ? <div className="alert alert-warn">{t('settings.notifications.denied')}</div> : null}
      {state === 'off' ? <div><Button onClick={() => void enable.run()} disabled={enable.busy}>{t('settings.notifications.enable')}</Button></div> : null}
      {state === 'on' ? <div className="ar-row"><span className="ar-small">{t('settings.notifications.on')}</span><Button variant="ghost" size="sm" onClick={() => void disable.run()}>{t('settings.notifications.disable')}</Button></div> : null}
    </section>
  );
}

function SlackSetting() {
  const { api, org, refresh } = useOrg();
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const save = useAction(async (value: string | null) => {
    await api('/app/org', { method: 'PATCH', body: { slack_webhook_url: value } });
    setUrl('');
    await refresh();
  });
  const connected = !!org?.organization.slack_connected;
  return (
    <section className="ar-solid ar-stack">
      <h2 className="ar-h3">Slack</h2>
      <p className="ar-small ar-muted" style={{ margin: 0 }}>{t('settings.slack.lead')}</p>
      {connected ? (
        <div className="ar-row"><span className="ar-small">{t('settings.slack.connected')}</span><Button variant="ghost" size="sm" onClick={() => void save.run(null)}>{t('settings.slack.disconnect')}</Button></div>
      ) : (
        <div className="form-row" style={{ alignItems: 'end' }}>
          <Field label={t('settings.slack.urlLabel')}><input className="ar-input ar-mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('settings.slack.urlPlaceholder')} /></Field>
          <div><Button onClick={() => void save.run(url.trim())} disabled={save.busy || !url.trim()}>{t('settings.slack.connect')}</Button></div>
        </div>
      )}
      <ErrorAlert error={save.error} />
    </section>
  );
}

function CardDelivery() {
  const { api, org, refresh } = useOrg();
  const { t } = useI18n();
  const current = org?.organization.card_delivery ?? 'issuer_link';
  const save = useAction(async (mode: 'issuer_link' | 'direct') => {
    if (mode === 'direct' && !confirm(t('settings.delivery.confirmDirect'))) return;
    await api('/app/org', { method: 'PATCH', body: { card_delivery: mode } });
    await refresh();
  });
  return (
    <section className="ar-solid ar-stack">
      <h2 className="ar-h3">{t('settings.delivery.title')}</h2>
      <label className="ar-row ar-small" style={{ alignItems: 'flex-start' }}>
        <input type="radio" name="delivery" checked={current === 'issuer_link'} onChange={() => void save.run('issuer_link')} />
        <span><strong>{t('settings.delivery.linkTitle')}</strong><br />{t('settings.delivery.linkText')}</span>
      </label>
      <label className="ar-row ar-small" style={{ alignItems: 'flex-start' }}>
        <input type="radio" name="delivery" checked={current === 'direct'} onChange={() => void save.run('direct')} />
        <span><strong>{t('settings.delivery.directTitle')}</strong><br />{t('settings.delivery.directText')}</span>
      </label>
      <ErrorAlert error={save.error} />
    </section>
  );
}

export function Settings() {
  const { api, org, can, refresh } = useOrg();
  const { email, signOut } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState(org?.organization.name ?? '');
  const rename = useAction(async () => {
    await api('/app/org', { method: 'PATCH', body: { name } });
    await refresh();
  });
  const freeze = useAction(async () => {
    if (!confirm(t('settings.emergency.confirmFreeze'))) return;
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
      <PageStage title={t('settings.title')} lead={email ?? undefined} />
      <div className="ar-container page-body ar-stack" style={{ gap: 24, maxWidth: 860 }}>
        <Passkeys />
        <Notifications />
        <section className="ar-solid ar-stack">
          <h2 className="ar-h3">{t('settings.language.title')}</h2>
          <p className="ar-small ar-muted" style={{ margin: 0 }}>{t('settings.language.lead')}</p>
          <div><LangSelect className="ar-select" /></div>
        </section>
        {can('owner', 'admin') ? (
          <section className="ar-solid ar-stack">
            <h2 className="ar-h3">{t('settings.org.title')}</h2>
            <div className="form-row" style={{ alignItems: 'end' }}>
              <Field label={t('settings.org.name')}><input className="ar-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
              <div><Button variant="ghost" onClick={() => void rename.run()} disabled={rename.busy || !name.trim()}>{t('settings.org.rename')}</Button></div>
            </div>
            <ErrorAlert error={rename.error} />
          </section>
        ) : null}
        {can('owner', 'admin') ? <SlackSetting /> : null}
        {can('owner') ? <CardDelivery /> : null}
        {can('owner', 'admin') ? (
          <section className="ar-solid ar-stack danger-zone" id="emergency">
            <h2 className="ar-h3">{t('settings.emergency.title')}</h2>
            <p className="ar-small" style={{ margin: 0 }}>
              {t('settings.emergency.lead')}
            </p>
            <ErrorAlert error={freeze.error ?? unfreeze.error} />
            <div className="ar-row">
              {frozen ? (
                <Button onClick={() => void unfreeze.run()} disabled={unfreeze.busy}>{t('settings.emergency.unfreeze')}</Button>
              ) : (
                <Button variant="danger" onClick={() => void freeze.run()} disabled={freeze.busy}>{t('settings.emergency.freeze')}</Button>
              )}
            </div>
            {frozen ? <p className="ar-small ar-muted" style={{ margin: 0 }}>{t('settings.emergency.afterUnfreeze')}</p> : null}
          </section>
        ) : null}
        <div><Button variant="ghost" onClick={() => void signOut()}>{t('settings.signOut')}</Button></div>
      </div>
    </>
  );
}
