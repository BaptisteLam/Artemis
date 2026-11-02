import { INTL_TAG, formatDate as fmtDate, formatMoney } from '@artemis/i18n';
import { currentLocale, t } from '../i18n';
export { parseEurosToCents } from '@artemis/shared';

/** Montant en centimes, au format de la langue courante. */
export const formatAmount = (cents: number, currency = 'EUR', opts: { sign?: boolean } = {}) => formatMoney(currentLocale(), cents, currency, opts);

/** « il y a 2 min » sous un jour, date au-delà — dans la langue courante. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const rtf = new Intl.RelativeTimeFormat(INTL_TAG[currentLocale()], { numeric: 'auto' });
  const time = new Date(iso).getTime();
  const diff = (time - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return fmtDate(currentLocale(), new Date(time), 'datetime');
}

export const formatDate = (iso: string | null | undefined) => (iso ? fmtDate(currentLocale(), iso, 'date') : '—');
export const formatDateTime = (iso: string | null | undefined) => (iso ? fmtDate(currentLocale(), iso, 'datetime') : '—');

export type Tone = 'gain' | 'loss' | 'pending' | 'info' | 'neutral';
const STATUS_TONE: Record<string, Tone> = {
  pending: 'pending', approved: 'info', issued: 'info', completed: 'gain', rejected: 'loss', expired: 'neutral', failed: 'loss',
  canceled: 'neutral', active: 'info', pending_bank_sca: 'pending', used: 'gain', frozen: 'loss', matched: 'gain', mismatch: 'loss', unmatched: 'neutral',
};

/** Libellé traduit et couleur d'un statut (demande, carte, agent, rapprochement). */
export function statusLabel(status: string): { label: string; tone: Tone } {
  const tone = STATUS_TONE[status];
  return tone ? { label: t(`status.${status}`), tone } : { label: status, tone: 'neutral' };
}

export const ROLES = ['owner', 'admin', 'approver', 'viewer'] as const;
export const roleLabel = (role: string) => ((ROLES as readonly string[]).includes(role) ? t(`roles.${role}`) : role);
