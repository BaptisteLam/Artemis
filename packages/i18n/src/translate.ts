import { DEFAULT_LOCALE, INTL_TAG, type Locale } from './locales';

/** Catalogue de messages : objets imbriqués de chaînes (ex. `{ nav: { pricing: "Pricing" } }`). */
export interface Messages {
  [key: string]: string | Messages;
}

export type Flat = Record<string, string>;
export type Vars = Record<string, string | number>;

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Aplatit un catalogue : `{ a: { b: "x" } }` → `{ "a.b": "x" }`. */
export function flatten(messages: Messages, prefix = '', out: Flat = {}): Flat {
  for (const [k, v] of Object.entries(messages)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}

/** Fusionne plusieurs catalogues (espaces de noms) en un seul catalogue plat. */
export function mergeFlat(...catalogs: Messages[]): Flat {
  const out: Flat = {};
  for (const c of catalogs) flatten(c, '', out);
  return out;
}

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

const pluralRules = new Map<string, Intl.PluralRules>();
export function pluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  const tag = INTL_TAG[locale];
  let r = pluralRules.get(tag);
  if (!r) {
    r = new Intl.PluralRules(tag);
    pluralRules.set(tag, r);
  }
  return r.select(count);
}

export type Translate = (key: string, vars?: Vars) => string;

/**
 * Crée la fonction `t`. Pluriels : `t('cards', { count })` cherche `cards_one`, `cards_few`… selon
 * les règles de la langue, puis `cards_other`. Clé absente → texte anglais, puis la clé elle-même.
 */
export function createTranslator(locale: Locale, messages: Flat, fallback: Flat = {}, onMissing?: (key: string) => void): Translate {
  const lookup = (key: string): string | undefined => messages[key] ?? (locale === DEFAULT_LOCALE ? undefined : fallback[key]);
  return (key, vars) => {
    let s: string | undefined;
    if (vars && typeof vars.count === 'number') {
      s = lookup(`${key}_${pluralCategory(locale, vars.count)}`) ?? lookup(`${key}_other`);
    }
    s ??= lookup(key);
    if (s === undefined) {
      onMissing?.(key);
      return key;
    }
    return interpolate(s, vars);
  };
}

/** Catégories de pluriel exigées pour une langue (règles CLDR). */
export function requiredPluralCategories(locale: Locale): Intl.LDMLPluralRule[] {
  return new Intl.PluralRules(INTL_TAG[locale]).resolvedOptions().pluralCategories as Intl.LDMLPluralRule[];
}

export function pluralBase(key: string): string | null {
  return PLURAL_SUFFIX.test(key) ? key.replace(PLURAL_SUFFIX, '') : null;
}
