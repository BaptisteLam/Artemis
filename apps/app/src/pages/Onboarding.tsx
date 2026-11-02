import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Glass, Logo, Stage } from '@artemis/ui';
import type { OrganizationRow } from '@artemis/db';
import { useOrg } from '../lib/OrgProvider';
import { ErrorAlert, useAction } from '../components';
import { McpConfig } from './agents/McpConfig';
import { enrollPasskey, passkeysSupported } from '../lib/passkeys';
import type { PublicAgent } from '../lib/types';
import { formatMoney } from '@artemis/i18n';
import { useI18n } from '../i18n';

const PLATFORMS = [
  ['claude', 'Claude'],
  ['chatgpt', 'ChatGPT'],
  ['n8n', 'n8n'],
  ['make', 'Make'],
  ['api', 'Code / API'],
  ['other', null],
] as const;

export function Onboarding() {
  const { api, setOrgId, refresh } = useOrg();
  const { t, locale } = useI18n();
  const whole = (cents: number) => formatMoney(locale, cents, 'EUR', { whole: true });
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [orgName, setOrgName] = useState('');
  const [agentName, setAgentName] = useState('notion.agent');
  const [platform, setPlatform] = useState('claude');
  const [token, setToken] = useState<string | null>(null);
  const [passkeyDone, setPasskeyDone] = useState(false);

  const createOrg = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const { organization } = await api<{ organization: OrganizationRow }>('/app/orgs', { method: 'POST', body: { name: orgName } });
    setOrgId(organization.id);
    setStep(1);
  });
  const createAgent = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const r = await api<{ agent: PublicAgent; token: string }>('/app/agents', { method: 'POST', body: { name: agentName, platform } });
    setToken(r.token);
    setStep(2);
  });
  const passkey = useAction(async () => {
    await enrollPasskey(api, t('onboarding.passkey.deviceName'));
    setPasskeyDone(true);
  });

  const stepLabel = (n: number) => <span className="ar-micro ar-muted">{t('onboarding.step', { step: n, total: 4 })}</span>;

  return (
    <Stage className="login-wrap">
      <div className="ar-stack" style={{ width: 'min(640px, 100%)', gap: 24 }}>
        <Logo variant="white" size={24} withWordmark />
        <div className="steps-bar" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}
        </div>
        <Glass tone="frost" rise key={step}>
          {step === 0 ? (
            <form className="form" onSubmit={(e) => void createOrg.run(e)}>
              <div>
                {stepLabel(1)}
                <h1 className="ar-h3">{t('onboarding.org.title')}</h1>
                <p className="ar-muted ar-small" style={{ margin: '6px 0 0' }}>{t('onboarding.org.lead')}</p>
              </div>
              <Field label={t('onboarding.org.nameLabel')}>
                <input className="ar-input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required maxLength={120} autoFocus />
              </Field>
              <ErrorAlert error={createOrg.error} />
              <Button type="submit" disabled={createOrg.busy || !orgName.trim()}>{t('onboarding.continue')}</Button>
            </form>
          ) : step === 1 ? (
            <form className="form" onSubmit={(e) => void createAgent.run(e)}>
              <div>
                {stepLabel(2)}
                <h1 className="ar-h3">{t('onboarding.agent.title')}</h1>
                <p className="ar-muted ar-small" style={{ margin: '6px 0 0' }}>
                  {t('onboarding.agent.lead', { monthly: whole(50000), perPurchase: whole(10000) })}
                </p>
              </div>
              <div className="form-row">
                <Field label={t('onboarding.agent.nameLabel')}>
                  <input className="ar-input ar-mono" value={agentName} onChange={(e) => setAgentName(e.target.value)} required maxLength={80} />
                </Field>
                <Field label={t('onboarding.agent.platformLabel')}>
                  <select className="ar-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                    {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l ?? t('onboarding.agent.platformOther')}</option>)}
                  </select>
                </Field>
              </div>
              <ErrorAlert error={createAgent.error} />
              <Button type="submit" disabled={createAgent.busy || !agentName.trim()}>{t('onboarding.agent.submit')}</Button>
            </form>
          ) : step === 2 && token ? (
            <div className="ar-stack">
              <div>
                {stepLabel(3)}
                <h1 className="ar-h3">{t('onboarding.connect.title')}</h1>
              </div>
              <McpConfig token={token} />
              <Button onClick={() => setStep(3)}>{t('onboarding.connect.done')}</Button>
            </div>
          ) : (
            <div className="ar-stack">
              <div>
                {stepLabel(4)}
                <h1 className="ar-h3">{t('onboarding.passkey.title')}</h1>
                <p className="ar-muted ar-small" style={{ margin: '6px 0 0' }}>{t('onboarding.passkey.lead')}</p>
              </div>
              {passkeyDone ? <div className="alert alert-info">{t('onboarding.passkey.saved')}</div> : null}
              {!passkeysSupported() ? <div className="alert alert-warn">{t('onboarding.passkey.unsupported')}</div> : null}
              <ErrorAlert error={passkey.error} />
              <div className="ar-row">
                {!passkeyDone ? (
                  <Button onClick={() => void passkey.run()} disabled={passkey.busy || !passkeysSupported()}>{t('onboarding.passkey.register')}</Button>
                ) : null}
                <Button variant={passkeyDone ? 'primary' : 'ghost'} onClick={async () => { await refresh(); navigate('/', { replace: true }); }}>
                  {passkeyDone ? t('onboarding.passkey.openDashboard') : t('onboarding.passkey.later')}
                </Button>
              </div>
            </div>
          )}
        </Glass>
      </div>
    </Stage>
  );
}
