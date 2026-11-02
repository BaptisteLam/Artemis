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
import { useI18n } from '../../i18n';
import { formatMoney } from '@artemis/i18n';
import { PLAN_LIMITS } from '@artemis/shared';

type Provider = 'stripe' | 'qonto' | 'revolut';

/** Libellés : `banks.fields.<id>` ; aides : `banks.hints.<hint>` ; présentation : `banks.help.<provider>`. */
const PROVIDERS: Record<Provider, { name: string; fields: { key: string; label: string; hint?: string; secret?: boolean; options?: string[] }[] }> = {
  stripe: {
    name: 'Stripe Issuing',
    fields: [
      { key: 'secretKey', label: 'restrictedSecretKey', hint: 'stripeSecretKey', secret: true },
      { key: 'publishableKey', label: 'publishableKey', hint: 'stripePublishableKey' },
      { key: 'cardholderId', label: 'stripeCardholder', hint: 'stripeCardholder' },
      { key: 'companyName', label: 'companyName', hint: 'ifNoCardholder' },
      { key: 'billing.line1', label: 'address', hint: 'ifNoCardholder' },
      { key: 'billing.postal_code', label: 'postalCode' },
      { key: 'billing.city', label: 'city' },
      { key: 'billing.country', label: 'country', hint: 'country' },
      { key: 'webhookSecret', label: 'webhookSecret', hint: 'webhookSecret', secret: true },
    ],
  },
  qonto: {
    name: 'Qonto',
    fields: [
      { key: 'accessToken', label: 'accessToken', hint: 'bearerOAuth', secret: true },
      { key: 'refreshToken', label: 'refreshToken', hint: 'optional', secret: true },
      { key: 'clientId', label: 'oauthClientId', hint: 'toRefreshToken' },
      { key: 'clientSecret', label: 'oauthClientSecret', secret: true },
      { key: 'holderId', label: 'holderMemberId', hint: 'qontoMembershipId' },
      { key: 'bankAccountId', label: 'bankAccountId', hint: 'qontoBankAccountId' },
      { key: 'environment', label: 'environment', options: ['production', 'sandbox'] },
      { key: 'stagingToken', label: 'stagingToken', hint: 'sandboxOnly', secret: true },
    ],
  },
  revolut: {
    name: 'Revolut Business',
    fields: [
      { key: 'accessToken', label: 'accessToken', hint: 'businessApi', secret: true },
      { key: 'refreshToken', label: 'refreshToken', hint: 'optional', secret: true },
      { key: 'clientAssertion', label: 'clientAssertion', hint: 'optionalForRefresh', secret: true },
      { key: 'holderId', label: 'holderId', hint: 'teamMemberOptional' },
      { key: 'environment', label: 'environment', options: ['production', 'sandbox'] },
    ],
  },
};

function ConnectForm({ onDone }: { onDone: () => void }) {
  const { api } = useOrg();
  const { t } = useI18n();
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
      <div className="tabs" role="group" aria-label={t('banks.bankAria')}>
        {(Object.keys(PROVIDERS) as Provider[]).map((k) => (
          <button key={k} type="button" aria-pressed={provider === k} onClick={() => setProvider(k)}>{PROVIDERS[k].name}</button>
        ))}
      </div>
      <p className="ar-small ar-muted" style={{ margin: 0 }}>{t(`banks.help.${provider}`)}</p>
      <div className="form-row">
        {p.fields.map((f) => (
          <Field key={f.key} label={t(`banks.fields.${f.label}`)} hint={f.hint ? t(`banks.hints.${f.hint}`) : undefined}>
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
      <p className="ar-small ar-muted" style={{ margin: 0 }}>{t('banks.encrypted')}</p>
      <ErrorAlert error={submit.error} />
      <div><Button type="submit" disabled={submit.busy}>{submit.busy ? t('banks.testing') : t('banks.connectProvider', { name: p.name })}</Button></div>
    </form>
  );
}

export function Banks() {
  const { api, can, org } = useOrg();
  const { t, locale } = useI18n();
  const { data, error, loading, reload } = useData<{ connections: PublicConnection[] }>('/app/connections');
  const [tested, setTested] = useState<Record<string, string>>({});
  const test = useAction(async (id: string) => {
    const r = await api<{ ok: boolean; detail?: string }>(`/app/connections/${id}/test`, { method: 'POST' });
    setTested((prev) => ({ ...prev, [id]: r.ok ? t('banks.testOk') : t('banks.testFailed', { detail: r.detail ?? '' }) }));
  });
  const remove = useAction(async (id: string) => {
    if (!confirm(t('banks.confirmDisconnect'))) return;
    await api(`/app/connections/${id}`, { method: 'DELETE' });
    await reload();
  });
  const paid = org?.effective_plan !== 'sandbox';
  return (
    <>
      <PageStage title={t('banks.title')} lead={t('banks.lead')} />
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        <ErrorAlert error={error ?? test.error ?? remove.error} />
        {loading && !data ? <Loading /> : null}
        <section className="ar-solid">
          <div className="list">
            {data?.connections.map((c) => (
              <div key={c.id} className="list-item">
                <div className="grow">
                  <div>{c.label} <span className="ar-muted ar-small">· {c.provider}</span></div>
                  <div className="sub">{t('banks.lastSync', { date: formatDateTime(c.last_sync_at) })}{tested[c.id] ? ` · ${tested[c.id]}` : ''}</div>
                  {c.provider === 'stripe' ? (
                    <div className="sub" style={{ whiteSpace: 'normal' }}>
                      {t('banks.stripeWebhook')} {`${API_URL}/webhooks/stripe-issuing/${c.id}`} <CopyButton text={`${API_URL}/webhooks/stripe-issuing/${c.id}`} />
                    </div>
                  ) : null}
                </div>
                <StatusBadge status={c.status === 'active' ? 'active' : 'failed'} />
                {can('owner', 'admin') ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => void test.run(c.id)}>{t('banks.test')}</Button>
                    {c.provider !== 'sandbox' ? <Button variant="ghost" size="sm" onClick={() => void remove.run(c.id)}>{t('banks.disconnect')}</Button> : null}
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </section>
        {can('owner', 'admin') ? (
          <section className="ar-solid">
            <h2 className="ar-h3" style={{ marginBottom: 12 }}>{t('banks.connectRealBank')}</h2>
            {paid ? <ConnectForm onDone={() => void reload()} /> : (
              <div className="alert alert-info">{t('banks.upgrade', { price: formatMoney(locale, PLAN_LIMITS.builder.priceEur * 100, 'EUR', { whole: true }) })} <Link to="/billing">{t('banks.choosePlan')}</Link></div>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
