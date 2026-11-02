import {
  DEFAULT_LOCALE,
  LOCALES,
  createTranslator,
  formatDate,
  formatMoney,
  formatNumber,
  isLocale,
  mergeFlat,
  type Flat,
  type Locale,
  type Messages,
} from '@artemis/i18n';

/**
 * Traductions du site. Un fichier JSON par espace de noms et par langue :
 * `messages/<langue>/<espace>.json`. L'anglais (`en`) est la source ; toute clé doit exister
 * dans les 24 langues (vérifié par `test/i18n.test.ts`, bloquant en CI).
 */
const files = import.meta.glob<Messages>('./messages/*/*.json', { eager: true, import: 'default' });

export const catalogs = {} as Record<Locale, Flat>;
for (const l of LOCALES) {
  const own = Object.entries(files)
    .filter(([path]) => path.split('/')[2] === l)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, m]) => m);
  catalogs[l] = mergeFlat(...own);
}

/** Langue d'une URL : `/de/pricing` → `de` ; sans préfixe → anglais. */
export function localeFromPath(pathname: string): Locale {
  const seg = pathname.split('/')[1];
  return isLocale(seg) && seg !== DEFAULT_LOCALE ? seg : DEFAULT_LOCALE;
}

/** Retire le préfixe de langue : `/de/pricing` → `/pricing`. */
export function stripLocale(pathname: string): string {
  const seg = pathname.split('/')[1];
  if (isLocale(seg) && seg !== DEFAULT_LOCALE) return pathname.slice(seg.length + 1) || '/';
  return pathname || '/';
}

/** Chemin dans une langue : anglais sans préfixe, les autres sous `/<langue>`. */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? `/${locale}/` : `/${locale}${clean}`;
}

/** Chemins statiques d'une page : `/pricing` (anglais) et `/<langue>/pricing`. */
export function localeStaticPaths() {
  return LOCALES.map((l) => ({ params: { lang: l === DEFAULT_LOCALE ? undefined : l } }));
}

export function i18n(url: URL) {
  const locale = localeFromPath(url.pathname);
  const t = createTranslator(locale, catalogs[locale], catalogs[DEFAULT_LOCALE], (key) => {
    throw new Error(`Texte non traduit : clé « ${key} » absente du catalogue anglais (apps/site/src/i18n/messages/en).`);
  });
  return {
    locale,
    t,
    /** Lien interne dans la langue courante. */
    href: (path: string) => localePath(locale, path),
    money: (cents: number, opts?: { sign?: boolean; whole?: boolean }) => formatMoney(locale, cents, 'EUR', opts),
    number: (n: number) => formatNumber(locale, n),
    date: (d: Date | string) => formatDate(locale, d),
  };
}
