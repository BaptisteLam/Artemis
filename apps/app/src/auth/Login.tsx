import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, Field, Glass, Logo, Stage } from '@artemis/ui';
import { DEFAULT_LOCALE } from '@artemis/i18n';
import { AUTH_MODE, SITE_URL } from '../lib/config';
import { useI18n } from '../i18n';
import { LangSelect } from '../i18n/LangSelect';
import { useAuth } from './AuthProvider';

/** Insère des éléments React à la place des variables `{nom}` d'un message traduit. */
function split(message: string, parts: Record<string, ReactNode>): ReactNode[] {
  return message.split(/\{(\w+)\}/).map((chunk, i) => (i % 2 ? <Fragment key={i}>{parts[chunk] ?? `{${chunk}}`}</Fragment> : chunk));
}

export function Login({ mode }: { mode: 'login' | 'signup' }) {
  const { email: current, sendMagicLink, devSignIn } = useAuth();
  const { t, locale } = useI18n();
  const site = (path: string) => `${SITE_URL}${locale === DEFAULT_LOCALE ? '' : `/${locale}`}${path}`;
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (current) {
    const next = new URLSearchParams(location.search).get('next') ?? '/';
    return <Navigate to={next.startsWith('/') ? next : '/'} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError(t('auth.invalidEmail'));
      return;
    }
    if (AUTH_MODE === 'dev') {
      devSignIn(email);
      return;
    }
    setBusy(true);
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stage className="login-wrap">
      <div style={{ position: 'fixed', top: 16, right: 16 }}>
        <LangSelect />
      </div>
      <div className="login-card ar-stack" style={{ gap: 24 }}>
        <a href={site('/')} aria-label={t('auth.siteLink')}>
          <Logo variant="white" size={26} withWordmark />
        </a>
        <Glass tone="frost" rise>
          {sent ? (
            <div className="ar-stack">
              <h1 className="ar-h3">{t('auth.sent.title')}</h1>
              <p className="ar-muted" style={{ margin: 0 }}>
                {split(t('auth.sent.body'), { email: <strong>{email}</strong> })}
              </p>
              <Button variant="ghost" onClick={() => setSent(false)}>
                {t('auth.sent.otherAddress')}
              </Button>
            </div>
          ) : (
            <form className="form" onSubmit={submit} noValidate>
              <div>
                <h1 className="ar-h3">{mode === 'signup' ? t('auth.signup.title') : t('auth.login.title')}</h1>
                <p className="ar-muted ar-small" style={{ margin: '6px 0 0' }}>
                  {mode === 'signup' ? t('auth.signup.lead') : t('auth.login.lead')}
                </p>
              </div>
              <Field label={t('auth.emailLabel')} error={error ?? undefined}>
                <input className="ar-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </Field>
              <Button type="submit" disabled={busy}>
                {busy ? t('auth.sending') : AUTH_MODE === 'dev' ? t('auth.devSubmit') : t('auth.submit')}
              </Button>
              <p className="ar-small ar-muted" style={{ margin: 0 }}>
                {mode === 'signup' ? (
                  <>{t('auth.signup.haveAccount')} <a href="/login">{t('auth.signup.loginLink')}</a></>
                ) : (
                  <>{t('auth.login.noAccount')} <a href="/signup">{t('auth.login.signupLink')}</a></>
                )}
              </p>
            </form>
          )}
        </Glass>
        <p className="ar-small ar-muted" style={{ margin: 0 }}>
          {split(t('auth.legal'), {
            terms: <a href={site('/terms')} style={{ color: 'inherit' }}>{t('auth.terms')}</a>,
            privacy: <a href={site('/privacy')} style={{ color: 'inherit' }}>{t('auth.privacy')}</a>,
          })}
        </p>
      </div>
    </Stage>
  );
}

export function AuthCallback() {
  const { email, ready } = useAuth();
  const { t } = useI18n();
  if (ready && email) return <Navigate to="/" replace />;
  return (
    <Stage className="login-wrap">
      <p>{t('auth.signingIn')}</p>
    </Stage>
  );
}
