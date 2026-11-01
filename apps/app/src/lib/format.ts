export { formatAmount, parseEurosToCents } from '@artemis/shared';

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const dtf = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** « il y a 2 min » sous un jour, date au-delà. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const diff = (t - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return dtf.format(new Date(t));
}

export const formatDate = (iso: string | null | undefined) => (iso ? df.format(new Date(iso)) : '—');
export const formatDateTime = (iso: string | null | undefined) => (iso ? dtf.format(new Date(iso)) : '—');

export const STATUS_LABEL: Record<string, { label: string; tone: 'gain' | 'loss' | 'pending' | 'info' | 'neutral' }> = {
  pending: { label: 'À valider', tone: 'pending' },
  approved: { label: 'Validée', tone: 'info' },
  issued: { label: 'Carte émise', tone: 'info' },
  completed: { label: 'Payée', tone: 'gain' },
  rejected: { label: 'Refusée', tone: 'loss' },
  expired: { label: 'Expirée', tone: 'neutral' },
  failed: { label: 'Échec banque', tone: 'loss' },
  canceled: { label: 'Annulée', tone: 'neutral' },
  active: { label: 'Active', tone: 'info' },
  pending_bank_sca: { label: 'Validation banque', tone: 'pending' },
  used: { label: 'Utilisée', tone: 'gain' },
  frozen: { label: 'Gelé', tone: 'loss' },
  matched: { label: 'Rapprochée', tone: 'gain' },
  mismatch: { label: 'Écart', tone: 'loss' },
  unmatched: { label: 'Non rapprochée', tone: 'neutral' },
};

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  approver: 'Approbateur',
  viewer: 'Lecteur',
};
