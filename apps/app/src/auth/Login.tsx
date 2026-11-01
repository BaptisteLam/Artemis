import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, Field, Glass, Logo, Stage } from '@artemis/ui';
import { AUTH_MODE, SITE_URL } from '../lib/config';
import { useAuth } from './AuthProvider';

export function Login({ mode }: { mode: 'login' | 'signup' }) {
  const { email: current, sendMagicLink, devSignIn } = useAuth();
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
      setError('Saisissez une adresse email valide.');
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
      <div className="login-card ar-stack" style={{ gap: 24 }}>
        <a href={SITE_URL} aria-label="Artemis, site">
          <Logo variant="white" size={26} withWordmark />
        </a>
        <Glass tone="frost" rise>
          {sent ? (
            <div className="ar-stack">
              <h1 className="ar-h3">Vérifiez votre boîte mail</h1>
              <p className="ar-muted" style={{ margin: 0 }}>
                Nous avons envoyé un lien de connexion à <strong>{email}</strong>. Il est valable une heure.
              </p>
              <Button variant="ghost" onClick={() => setSent(false)}>
                Utiliser une autre adresse
              </Button>
            </div>
          ) : (
            <form className="form" onSubmit={submit} noValidate>
              <div>
                <h1 className="ar-h3">{mode === 'signup' ? 'Créer votre compte' : 'Se connecter'}</h1>
                <p className="ar-muted ar-small" style={{ margin: '6px 0 0' }}>
                  {mode === 'signup' ? 'Gratuit en Sandbox, sans carte bancaire.' : 'Recevez un lien de connexion par email.'}
                </p>
              </div>
              <Field label="Email professionnel" error={error ?? undefined}>
                <input className="ar-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </Field>
              <Button type="submit" disabled={busy}>
                {busy ? 'Envoi…' : AUTH_MODE === 'dev' ? 'Entrer (mode dev)' : 'Recevoir le lien'}
              </Button>
              <p className="ar-small ar-muted" style={{ margin: 0 }}>
                {mode === 'signup' ? (
                  <>Déjà inscrit ? <a href="/connexion">Se connecter</a></>
                ) : (
                  <>Pas encore de compte ? <a href="/inscription">Créer un compte</a></>
                )}
              </p>
            </form>
          )}
        </Glass>
        <p className="ar-small ar-muted" style={{ margin: 0 }}>
          En continuant, vous acceptez les <a href={`${SITE_URL}/cgv`} style={{ color: 'inherit' }}>conditions</a> et la{' '}
          <a href={`${SITE_URL}/confidentialite`} style={{ color: 'inherit' }}>politique de confidentialité</a>.
        </p>
      </div>
    </Stage>
  );
}

export function AuthCallback() {
  const { email, ready } = useAuth();
  if (ready && email) return <Navigate to="/" replace />;
  return (
    <Stage className="login-wrap">
      <p>Connexion en cours…</p>
    </Stage>
  );
}
