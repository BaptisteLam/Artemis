import { INTL_TAG, type Locale } from './locales';

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat>(key: string, make: () => T): T {
  let f = cache.get(key) as T | undefined;
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
}

/** Montant en centimes, au format de la langue : `€49.00`, `49,00 €`, `49,00 €`… */
export function formatMoney(locale: Locale, cents: number, currency = 'EUR', opts: { sign?: boolean; whole?: boolean } = {}): string {
  const f = cached(`m:${locale}:${currency}:${opts.whole ? 0 : 2}`, () =>
    new Intl.NumberFormat(INTL_TAG[locale], { style: 'currency', currency, ...(opts.whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}) }),
  );
  const abs = f.format(Math.abs(cents) / 100);
  if (cents < 0) return `−${abs}`;
  if (opts.sign && cents > 0) return `+${abs}`;
  return abs;
}

export function formatNumber(locale: Locale, n: number): string {
  return cached(`n:${locale}`, () => new Intl.NumberFormat(INTL_TAG[locale])).format(n);
}

export function formatDate(locale: Locale, d: Date | string, style: 'date' | 'datetime' | 'time' = 'date'): string {
  const opts: Intl.DateTimeFormatOptions =
    style === 'date' ? { dateStyle: 'medium' } : style === 'time' ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' };
  return cached(`d:${locale}:${style}`, () => new Intl.DateTimeFormat(INTL_TAG[locale], opts)).format(typeof d === 'string' ? new Date(d) : d);
}
