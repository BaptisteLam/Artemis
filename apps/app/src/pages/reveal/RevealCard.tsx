import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Amount, Button, Glass, Logo, Stage } from '@artemis/ui';
import { API_URL } from '../../lib/config';
import { CopyButton, ErrorAlert, Loading } from '../../components';
import { t, useI18n } from '../../i18n';

interface Meta {
  provider: 'sandbox' | 'stripe' | string;
  last4: string;
  merchant: string;
  amount: number;
  currency: string;
  expires_at: string;
  stripe?: { publishableKey: string | null; cardId: string };
}
interface SandboxCard { number: string; exp_month: number; exp_year: number; cvc: string; name: string }

type StripeLike = {
  createEphemeralKeyNonce(o: { issuingCard: string }): Promise<{ nonce?: string; error?: { message: string } }>;
  elements(): { create(type: string, o: Record<string, unknown>): { mount(el: HTMLElement): void } };
};

function loadStripe(): Promise<(pk: string) => StripeLike> {
  const w = window as unknown as { Stripe?: (pk: string) => StripeLike };
  if (w.Stripe) return Promise.resolve(w.Stripe);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = () => (w.Stripe ? resolve(w.Stripe) : reject(new Error(t('reveal.errors.stripeUnavailable'))));
    s.onerror = () => reject(new Error(t('reveal.errors.stripeUnavailable')));
    document.head.appendChild(s);
  });
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  const body = (await res.json().catch(() => null)) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(body?.error?.message ?? t('reveal.errors.invalidLink'));
  return body;
}

/** Page publique du lien éphémère : affiche la carte une seule fois, depuis l'émetteur. */
export function RevealCard() {
  const { token = '' } = useParams();
  const { t } = useI18n();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [card, setCard] = useState<SandboxCard | null>(null);
  const [stripeShown, setStripeShown] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = { number: useRef<HTMLDivElement>(null), expiry: useRef<HTMLDivElement>(null), cvc: useRef<HTMLDivElement>(null) };

  useEffect(() => {
    call<Meta>(`/v1/reveal-links/${encodeURIComponent(token)}`).then(setMeta, setError);
  }, [token]);

  async function open() {
    if (!meta) return;
    setBusy(true);
    setError(null);
    try {
      if (meta.provider === 'stripe' && meta.stripe?.publishableKey) {
        const Stripe = await loadStripe();
        const stripe = Stripe(meta.stripe.publishableKey);
        const { nonce, error: e } = await stripe.createEphemeralKeyNonce({ issuingCard: meta.stripe.cardId });
        if (!nonce) throw new Error(e?.message ?? t('reveal.errors.stripeRefused'));
        const s = await call<{ stripe: { ephemeralKeySecret: string; cardId: string; nonce: string } }>(
          `/v1/reveal-links/${encodeURIComponent(token)}/session`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nonce }) },
        );
        const elements = stripe.elements();
        const opts = { issuingCard: s.stripe.cardId, nonce: s.stripe.nonce, ephemeralKeySecret: s.stripe.ephemeralKeySecret, style: { base: { color: '#171818', fontSize: '18px', fontFamily: 'ui-monospace, monospace' } } };
        setStripeShown(true);
        setTimeout(() => {
          if (refs.number.current) elements.create('issuingCardNumberDisplay', opts).mount(refs.number.current);
          if (refs.expiry.current) elements.create('issuingCardExpiryDisplay', opts).mount(refs.expiry.current);
          if (refs.cvc.current) elements.create('issuingCardCvcDisplay', opts).mount(refs.cvc.current);
        }, 0);
      } else {
        const s = await call<{ card: SandboxCard }>(`/v1/reveal-links/${encodeURIComponent(token)}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        setCard(s.card);
      }
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }

  const exp = card ? `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}` : '';
  return (
    <Stage className="login-wrap">
      <div className="ar-stack" style={{ width: 'min(460px, 100%)', gap: 20 }}>
        <Logo variant="white" size={22} withWordmark />
        <Glass tone="frost" rise>
          {!meta && !error ? <Loading /> : null}
          {error && !meta ? <ErrorAlert error={error} /> : null}
          {meta ? (
            <div className="ar-stack">
              <span className="ar-micro">{meta.provider === 'sandbox' ? t('reveal.eyebrowSandbox') : t('reveal.eyebrowBank')}</span>
              <div className="ar-spread">
                <strong>{meta.merchant}</strong>
                <Amount cents={meta.amount} currency={meta.currency} />
              </div>
              <p className="ar-small ar-muted" style={{ margin: 0 }}>{t('reveal.lead')}</p>
              {card ? (
                <div className="reveal-fields">
                  <div><small>{t('reveal.fields.number')}</small><strong className="ar-mono" data-testid="card-number">{card.number.replace(/(\d{4})(?=\d)/g, '$1 ')}</strong><CopyButton text={card.number} /></div>
                  <div><small>{t('reveal.fields.expiry')}</small><strong className="ar-mono">{exp}</strong><CopyButton text={exp} /></div>
                  <div><small>{t('reveal.fields.cvc')}</small><strong className="ar-mono">{card.cvc}</strong><CopyButton text={card.cvc} /></div>
                  <div><small>{t('reveal.fields.holder')}</small><strong className="ar-mono">{card.name}</strong></div>
                </div>
              ) : stripeShown ? (
                <div className="reveal-fields">
                  <div><small>{t('reveal.fields.number')}</small><div ref={refs.number} /></div>
                  <div><small>{t('reveal.fields.expiry')}</small><div ref={refs.expiry} /></div>
                  <div><small>{t('reveal.fields.cvc')}</small><div ref={refs.cvc} /></div>
                </div>
              ) : (
                <Button onClick={() => void open()} disabled={busy}>{busy ? t('reveal.opening') : t('reveal.show', { last4: meta.last4 })}</Button>
              )}
              <ErrorAlert error={meta ? error : null} />
            </div>
          ) : null}
        </Glass>
        <p className="ar-small" style={{ margin: 0, opacity: 0.85 }}>{t('reveal.footer')}</p>
      </div>
    </Stage>
  );
}
