export type BadgeTone = 'gain' | 'loss' | 'pending' | 'info' | 'neutral';

export function Badge({ tone, label, live = false }: { tone: BadgeTone; label: string; live?: boolean }) {
  return (
    <span className={`ar-badge ar-badge-${tone}${live ? ' ar-badge-live' : ''}`}>
      <span className="ar-badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
