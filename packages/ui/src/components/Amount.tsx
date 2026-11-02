import { formatMoney } from '@artemis/i18n';
import { getUiLocale } from '../locale';

export function Amount({
  cents,
  currency = 'EUR',
  sign = false,
  size = 'md',
  className = '',
}: {
  cents: number;
  currency?: string;
  sign?: boolean;
  size?: 'xl' | 'md' | 'sm';
  className?: string;
}) {
  const tone = sign && cents > 0 ? 'ar-amount-gain' : sign && cents < 0 ? 'ar-amount-loss' : '';
  const arrow = sign && cents !== 0 ? (cents > 0 ? '↑ ' : '↓ ') : '';
  return (
    <span className={`ar-amount ar-amount-${size} ${tone} ${className}`.trim()}>
      {arrow && <span aria-hidden="true">{arrow}</span>}
      {formatMoney(getUiLocale(), cents, currency, { sign })}
    </span>
  );
}
