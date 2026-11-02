import { DEFAULT_LOCALE, createTranslator, flatten, formatMoney, isLocale, type Locale, type Translate } from '@artemis/i18n';
import { CATALOGS } from './catalogs';

const EN = flatten(CATALOGS.en!);
const cache = new Map<Locale, Translate>();

/** Traducteur côté serveur (emails, notifications) ; langue inconnue → anglais. */
export function serverT(locale: string | null | undefined): { locale: Locale; t: Translate; money: (cents: number, currency?: string) => string } {
  const l: Locale = isLocale(locale) && CATALOGS[locale] ? locale : DEFAULT_LOCALE;
  let t = cache.get(l);
  if (!t) {
    t = createTranslator(l, flatten(CATALOGS[l]!), EN);
    cache.set(l, t);
  }
  return { locale: l, t, money: (cents, currency = 'EUR') => formatMoney(l, cents, currency) };
}
