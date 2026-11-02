/**
 * Langues prises en charge : les 24 langues officielles de l'Union européenne.
 * L'anglais est la langue native (source de toutes les traductions).
 */
export const LOCALES = [
  'en', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'ga', 'hr',
  'hu', 'it', 'lt', 'lv', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv',
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Langue dont la version fait foi pour les textes juridiques. */
export const LEGAL_AUTHORITATIVE_LOCALE: Locale = 'fr';

/** Nom de chaque langue dans sa propre langue (sélecteur). */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  bg: 'Български',
  cs: 'Čeština',
  da: 'Dansk',
  de: 'Deutsch',
  el: 'Ελληνικά',
  es: 'Español',
  et: 'Eesti',
  fi: 'Suomi',
  fr: 'Français',
  ga: 'Gaeilge',
  hr: 'Hrvatski',
  hu: 'Magyar',
  it: 'Italiano',
  lt: 'Lietuvių',
  lv: 'Latviešu',
  mt: 'Malti',
  nl: 'Nederlands',
  pl: 'Polski',
  pt: 'Português',
  ro: 'Română',
  sk: 'Slovenčina',
  sl: 'Slovenščina',
  sv: 'Svenska',
};

/** Balise BCP 47 utilisée pour Intl (montants, dates) — variantes européennes. */
export const INTL_TAG: Record<Locale, string> = {
  en: 'en-IE', bg: 'bg-BG', cs: 'cs-CZ', da: 'da-DK', de: 'de-DE', el: 'el-GR',
  es: 'es-ES', et: 'et-EE', fi: 'fi-FI', fr: 'fr-FR', ga: 'ga-IE', hr: 'hr-HR',
  hu: 'hu-HU', it: 'it-IT', lt: 'lt-LT', lv: 'lv-LV', mt: 'mt-MT', nl: 'nl-NL',
  pl: 'pl-PL', pt: 'pt-PT', ro: 'ro-RO', sk: 'sk-SK', sl: 'sl-SI', sv: 'sv-SE',
};

/**
 * Langue par pays (code ISO 3166-1, fourni par Cloudflare), utilisée quand le navigateur
 * n'indique aucune langue prise en charge. Pays multilingues : langue majoritaire.
 */
export const COUNTRY_LOCALE: Record<string, Locale> = {
  AT: 'de', BE: 'nl', BG: 'bg', CY: 'el', CZ: 'cs', DE: 'de', DK: 'da', EE: 'et',
  ES: 'es', FI: 'fi', FR: 'fr', GR: 'el', HR: 'hr', HU: 'hu', IE: 'en', IT: 'it',
  LT: 'lt', LU: 'fr', LV: 'lv', MT: 'mt', NL: 'nl', PL: 'pl', PT: 'pt', RO: 'ro',
  SE: 'sv', SI: 'sl', SK: 'sk',
  // Voisins et pays partageant une langue prise en charge.
  CH: 'de', LI: 'de', MC: 'fr', SM: 'it', VA: 'it', AD: 'es', GL: 'da', FO: 'da',
  AX: 'sv', MD: 'ro', ME: 'hr', BA: 'hr', GB: 'en', US: 'en', CA: 'en', AU: 'en',
  NZ: 'en', BR: 'pt', AO: 'pt', MZ: 'pt', MX: 'es', AR: 'es', CO: 'es', CL: 'es',
  PE: 'es', SN: 'fr', CI: 'fr', MA: 'fr', TN: 'fr', DZ: 'fr',
};

/** Langues non prises en charge rattachées à une langue proche que leurs locuteurs lisent. */
const ALIASES: Record<string, Locale> = {
  gsw: 'de', // suisse allemand
  lb: 'fr', // luxembourgeois → français (langue administrative)
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Langue prise en charge pour une balise (« de-AT » → « de »), sinon null. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  if (isLocale(primary)) return primary;
  return ALIASES[primary] ?? null;
}

/** Liste des langues d'un en-tête Accept-Language, par préférence décroissante. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: (tag ?? '').trim(), weight: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((x) => x.tag && x.tag !== '*' && x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.i - b.i)
    .map((x) => x.tag);
}

/**
 * Choisit la langue d'affichage, dans cet ordre :
 * 1. choix explicite de l'utilisateur (cookie / stockage local) ;
 * 2. première langue du navigateur prise en charge ;
 * 3. langue du pays d'où la page est ouverte ;
 * 4. anglais.
 */
export function negotiateLocale(input: { preferred?: string | null; languages?: readonly string[]; country?: string | null }): Locale {
  if (isLocale(input.preferred)) return input.preferred;
  for (const tag of input.languages ?? []) {
    const m = matchLocale(tag);
    if (m) return m;
  }
  const byCountry = input.country ? COUNTRY_LOCALE[input.country.toUpperCase()] : undefined;
  return byCountry ?? DEFAULT_LOCALE;
}
