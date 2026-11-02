import type { CSSProperties, ReactNode } from 'react';
import { LOGO_BLADE, LOGO_BLOCK, LOGO_VIEWBOX } from '../logo/paths';

export type PayCardVariant = 'cobalt' | 'glass' | 'ink';
export type PayCardState = 'active' | 'pending_bank_sca' | 'used' | 'canceled' | 'expired';

/** Libellés par défaut (anglais) ; l'app passe les libellés traduits via `stampLabel` et `ariaLabel`. */
const STAMP: Partial<Record<PayCardState, string>> = { used: 'Used', canceled: 'Cancelled', expired: 'Expired', pending_bank_sca: 'Pending' };

/** Carte bancaire virtuelle réaliste (format ISO ID-1). N'affiche jamais le numéro complet. */
export function PayCard({
  last4,
  holder,
  expMonth,
  expYear,
  tag = 'Single use',
  variant = 'cobalt',
  state = 'active',
  corner,
  stampLabel,
  ariaLabel,
  className = '',
  style,
}: {
  last4: string;
  holder: string;
  expMonth: number;
  expYear: number;
  tag?: string;
  variant?: PayCardVariant;
  state?: PayCardState;
  corner?: ReactNode;
  /** Texte du tampon (carte utilisée, annulée…), déjà traduit. */
  stampLabel?: string;
  /** Description accessible, déjà traduite. */
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const exp = `${String(expMonth).padStart(2, '0')}/${String(expYear).slice(-2)}`;
  const stamp = state === 'active' ? undefined : (stampLabel ?? STAMP[state]);
  return (
    <div
      className={`ar-paycard ar-paycard--${variant} ${className}`.trim()}
      data-state={state}
      role="img"
      aria-label={ariaLabel ?? `Virtual card ending in ${last4}, holder ${holder}, expires ${exp}`}
      style={style}
    >
      <div className="ar-paycard-inner" aria-hidden="true">
        <div className="ar-paycard-top">
          <span className="ar-paycard-brand">
            <svg viewBox={LOGO_VIEWBOX}>
              <path d={LOGO_BLADE} />
              <path d={LOGO_BLOCK} />
            </svg>
            Artemis
          </span>
          {corner ?? <span className="ar-paycard-tag">{tag}</span>}
        </div>
        <div className="ar-paycard-mid">
          <span className="ar-paycard-chip" />
          <svg className="ar-paycard-nfc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M8.5 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M15.5 3.5a12 12 0 0 1 0 17" />
          </svg>
        </div>
        <div className="ar-paycard-num">{`•••• •••• •••• ${last4}`}</div>
        <div className="ar-paycard-bottom">
          <div className="ar-paycard-field ar-paycard-field--grow">
            <small>Titulaire</small>
            <span>{holder}</span>
          </div>
          <div className="ar-paycard-field">
            <small>Expire</small>
            <span>{exp}</span>
          </div>
          <div className="ar-paycard-net">
            Debit<em>virtual</em>
          </div>
        </div>
      </div>
      {stamp ? <span className="ar-paycard-stamp">{stamp}</span> : null}
    </div>
  );
}
