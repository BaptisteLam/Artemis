import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LOCALE,
  createTranslator,
  formatDate as fmtDate,
  formatMoney,
  formatNumber,
  isLocale,
  mergeFlat,
  negotiateLocale,
  type Flat,
  type Locale,
  type Messages,
  type Translate,
  type Vars,
} from '@artemis/i18n';
import { setUiLocale } from '@artemis/ui';

/**
 * Traductions de l'app : `messages/<langue>/<espace>.json`. L'anglais est la source, chargé d'office ;
 * les autres langues sont chargées à la demande. Toute clé doit exister dans les 24 langues (test bloquant).
 */
const enFiles = import.meta.glob<Messages>('./messages/en/*.json', { eager: true, import: 'default' });
const otherFiles = import.meta.glob<Messages>(['./messages/*/*.json', '!./messages/en/*.json'], { import: 'default' });

export const EN: Flat = mergeFlat(...Object.keys(enFiles).sort().map((k) => enFiles[k]!));
const loaded: Partial<Record<Locale, Flat>> = { en: EN };

export const STORAGE_KEY = 'artemis_lang';

async function loadCatalog(locale: Locale): Promise<Flat> {
  if (loaded[locale]) return loaded[locale]!;
  const entries = Object.entries(otherFiles).filter(([p]) => p.split('/')[2] === locale).sort(([a], [b]) => a.localeCompare(b));
  const parts = await Promise.all(entries.map(([, load]) => load()));
  loaded[locale] = mergeFlat(...parts);
  return loaded[locale]!;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* stockage indisponible */
  }
}

/** Langue de départ : `?lang=` (lien depuis le site) > choix mémorisé > langue du navigateur > anglais. */
export function detectLocale(): Locale {
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (isLocale(fromUrl)) {
    store(fromUrl);
    return fromUrl;
  }
  return negotiateLocale({ preferred: readStored(), languages: navigator.languages ?? [navigator.language] });
}

let current: { locale: Locale; t: Translate } = { locale: DEFAULT_LOCALE, t: createTranslator(DEFAULT_LOCALE, EN) };

/** Traduction hors composant (erreurs réseau, libellés de statut…). Dans un composant, préférez `useI18n()`. */
export const t: Translate = (key: string, vars?: Vars) => current.t(key, vars);
export const currentLocale = () => current.locale;

function activate(locale: Locale, catalog: Flat) {
  // i18n-ignore : message destiné aux développeurs.
  current = { locale, t: createTranslator(locale, catalog, EN, (key) => console.warn(`[i18n] clé manquante : ${key}`)) };
  setUiLocale(locale);
  document.documentElement.lang = locale;
}

/** À appeler avant le premier rendu : charge la langue du visiteur. */
export async function initI18n(locale = detectLocale()): Promise<Locale> {
  try {
    activate(locale, await loadCatalog(locale));
    return locale;
  } catch {
    activate(DEFAULT_LOCALE, EN);
    return DEFAULT_LOCALE;
  }
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => Promise<void>;
  t: Translate;
  money: (cents: number, currency?: string, opts?: { sign?: boolean }) => string;
  number: (n: number) => string;
  date: (d: Date | string | null | undefined, style?: 'date' | 'datetime' | 'time') => string;
}

const Ctx = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setState] = useState<Locale>(current.locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale: async (l) => {
        activate(l, await loadCatalog(l));
        store(l);
        setState(l);
      },
      t: current.t,
      money: (cents, currency = 'EUR', opts) => formatMoney(locale, cents, currency, opts),
      number: (n) => formatNumber(locale, n),
      date: (d, style = 'date') => (d ? fmtDate(locale, d, style) : '—'),
    }),
    [locale],
  );
  // La clé force un nouveau rendu complet au changement de langue (y compris le texte hors contexte).
  return <Ctx.Provider value={value}><div key={locale} style={{ display: 'contents' }}>{children}</div></Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(Ctx);
  // i18n-ignore : message destiné aux développeurs.
  if (!v) throw new Error('useI18n doit être utilisé dans <I18nProvider>.');
  return v;
}
