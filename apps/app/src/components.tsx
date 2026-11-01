import { useState, type ReactNode } from 'react';
import { Badge, Button, Stage } from '@artemis/ui';
import type { ArtemisError } from '@artemis/shared';
import { STATUS_LABEL } from './lib/format';

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
  const s = STATUS_LABEL[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={s.tone} label={s.label} live={status === 'pending'} />;
}

export function ErrorAlert({ error }: { error: ArtemisError | Error | null | undefined }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      {error.message}
    </div>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <p className="ar-muted" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function CopyButton({ text, label = 'Copier' }: { text: string; label?: string }) {
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
      {done ? 'Copié' : label}
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
