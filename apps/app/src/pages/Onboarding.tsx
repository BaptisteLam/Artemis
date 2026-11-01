import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Glass, Logo, Stage } from '@artemis/ui';
import type { OrganizationRow } from '@artemis/db';
import { useOrg } from '../lib/OrgProvider';
import { ErrorAlert, useAction } from '../components';
import { McpConfig } from './agents/McpConfig';
import { enrollPasskey, passkeysSupported } from '../lib/passkeys';
import type { PublicAgent } from '../lib/types';

const PLATFORMS = [
  ['claude', 'Claude'],
  ['chatgpt', 'ChatGPT'],
  ['n8n', 'n8n'],
  ['make', 'Make'],
  ['api', 'Code / API'],
  ['other', 'Autre'],
] as const;

export function Onboarding() {
  const { api, setOrgId, refresh } = useOrg();
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
    await enrollPasskey(api, 'Premier appareil');
    setPasskeyDone(true);
  });

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
                <span className="ar-micro ar-muted">Étape 1 sur 4</span>
                <h1 className="ar-h3">Votre organisation</h1>
                <p className="ar-muted ar-small" style={{ margin: '6px 0 0' }}>Vous commencez en Sandbox : banque simulée, aucun frais.</p>
              </div>
              <Field label="Nom de l'entreprise ou du studio">
                <input className="ar-input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required maxLength={120} autoFocus />
              </Field>
              <ErrorAlert error={createOrg.error} />
              <Button type="submit" disabled={createOrg.busy || !orgName.trim()}>Continuer →</Button>
            </form>
          ) : step === 1 ? (
            <form className="form" onSubmit={(e) => void createAgent.run(e)}>
              <div>
                <span className="ar-micro ar-muted">Étape 2 sur 4</span>
                <h1 className="ar-h3">Votre premier agent</h1>
                <p className="ar-muted ar-small" style={{ margin: '6px 0 0' }}>Un nom court qui dit ce qu'il achète. Règles par défaut : 500 € par mois, 100 € par achat.</p>
              </div>
              <div className="form-row">
                <Field label="Nom de l'agent">
                  <input className="ar-input ar-mono" value={agentName} onChange={(e) => setAgentName(e.target.value)} required maxLength={80} />
                </Field>
                <Field label="Plateforme">
                  <select className="ar-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                    {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
              </div>
              <ErrorAlert error={createAgent.error} />
              <Button type="submit" disabled={createAgent.busy || !agentName.trim()}>Créer l'agent →</Button>
            </form>
          ) : step === 2 && token ? (
            <div className="ar-stack">
              <div>
                <span className="ar-micro ar-muted">Étape 3 sur 4</span>
                <h1 className="ar-h3">Branchez votre agent</h1>
              </div>
              <McpConfig token={token} />
              <Button onClick={() => setStep(3)}>J'ai copié le jeton →</Button>
            </div>
          ) : (
            <div className="ar-stack">
              <div>
                <span className="ar-micro ar-muted">Étape 4 sur 4</span>
                <h1 className="ar-h3">Votre passkey de validation</h1>
                <p className="ar-muted ar-small" style={{ margin: '6px 0 0' }}>
                  Chaque dépense sera signée avec Face ID, Touch ID, Windows Hello ou une clé de sécurité. Enregistrez-la depuis le téléphone qui recevra les notifications si possible.
                </p>
              </div>
              {passkeyDone ? <div className="alert alert-info">Passkey enregistrée.</div> : null}
              {!passkeysSupported() ? <div className="alert alert-warn">Ce navigateur ne prend pas en charge les passkeys.</div> : null}
              <ErrorAlert error={passkey.error} />
              <div className="ar-row">
                {!passkeyDone ? (
                  <Button onClick={() => void passkey.run()} disabled={passkey.busy || !passkeysSupported()}>Enregistrer une passkey</Button>
                ) : null}
                <Button variant={passkeyDone ? 'primary' : 'ghost'} onClick={async () => { await refresh(); navigate('/', { replace: true }); }}>
                  {passkeyDone ? 'Ouvrir le tableau de bord →' : 'Plus tard'}
                </Button>
              </div>
            </div>
          )}
        </Glass>
      </div>
    </Stage>
  );
}
