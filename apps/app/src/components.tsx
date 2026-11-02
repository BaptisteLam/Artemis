import { useState, type ReactNode } from 'react';
import { Badge, Button, Stage } from '@artemis/ui';
import type { ArtemisError } from '@artemis/shared';
import { statusLabel } from './lib/format';
import { t, useI18n } from './i18n';

export function PageStage({ eyebrow, title, lead, children, actions }: { eyebrow?: string; title: string; lead?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <Stage quiet className="page-stage-wrap">
      <div className="ar-container page-stage">
        <div className="ar-spread">
          <div>
            {eyebrow ? <span className="ar-micro ar-muted">{eyebrow}</span> : null}
            <h1 className="ar-h1">{title}</h1>
            {lead ? <p className="ar-muted" style={{ margin: 0, maxWidth: '60ch' }}>{lead}</p> : null}
          </div>
          {actions ? <div className="ar-row">{actions}</div> : null}
        </div>
        {children}
      </div>
    </Stage>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = statusLabel(status);
  return <Badge tone={s.tone} label={s.label} live={status === 'pending'} />;
}

/** Message d'erreur traduit : selon le code renvoyé par l'API (`errors.<code>`), sinon le message reçu. */
export function errorMessage(error: ArtemisError | Error): string {
  const code = (error as ArtemisError).code;
  if (code) {
    const key = `errors.${code}`;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  return error.message;
}

export function ErrorAlert({ error }: { error: ArtemisError | Error | null | undefined }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      {errorMessage(error)}
    </div>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <p className="ar-muted" role="status" aria-live="polite">
      {label ?? t('common.loading')}
    </p>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* presse-papiers indisponible */
        }
      }}
      style={{ background: 'var(--ar-surface)' }}
    >
      {done ? t('common.copied') : (label ?? t('common.copy'))}
    </Button>
  );
}

/** Exécute une action asynchrone avec état de chargement et d'erreur. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ArtemisError | Error | null>(null);
  const run = async (...args: A): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn(...args);
    } catch (e) {
      setError(e as Error);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error, setError };
}
