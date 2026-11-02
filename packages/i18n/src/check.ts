import type { Locale } from './locales';
import { pluralBase, requiredPluralCategories, type Flat } from './translate';

const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
const tags = (s: string) => [...s.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g)].map((m) => m[0].startsWith('</') ? `/${m[1]}` : m[1]!).sort();
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Vérifie qu'une traduction est complète et cohérente avec le catalogue anglais :
 * aucune clé manquante, vide ou obsolète ; mêmes variables `{x}` ; mêmes balises HTML ;
 * toutes les formes de pluriel exigées par la langue.
 */
export function checkTranslation(locale: Locale, base: Flat, target: Flat): string[] {
  const issues: string[] = [];
  const pluralGroups = new Map<string, Flat>();
  for (const [k, v] of Object.entries(base)) {
    const b = pluralBase(k);
    if (b) pluralGroups.set(b, { ...(pluralGroups.get(b) ?? {}), [k]: v });
  }
  const required = requiredPluralCategories(locale);
  const allowed = new Set<string>();

  for (const [key, source] of Object.entries(base)) {
    if (pluralBase(key)) continue;
    allowed.add(key);
    const v = target[key];
    if (v === undefined) issues.push(`${locale}: clé manquante « ${key} »`);
    else if (!v.trim()) issues.push(`${locale}: traduction vide « ${key} »`);
    else {
      if (!same(placeholders(source), placeholders(v))) issues.push(`${locale}: variables différentes dans « ${key} » (attendu ${placeholders(source).join(', ') || 'aucune'})`);
      if (!same(tags(source), tags(v))) issues.push(`${locale}: balises HTML différentes dans « ${key} »`);
    }
  }

  for (const [group, forms] of pluralGroups) {
    const other = forms[`${group}_other`];
    if (other === undefined) {
      issues.push(`en: pluriel « ${group} » sans forme _other`);
      continue;
    }
    for (const cat of required) {
      const key = `${group}_${cat}`;
      allowed.add(key);
      const v = target[key];
      if (v === undefined || !v.trim()) {
        issues.push(`${locale}: forme de pluriel manquante « ${key} »`);
        continue;
      }
      // Une forme au singulier peut omettre {count} (« un agent ») ; aucune autre variable ne doit changer.
      const expected = placeholders(other).filter((p) => p !== 'count');
      const got = placeholders(v).filter((p) => p !== 'count');
      if (!same(expected, got)) issues.push(`${locale}: variables différentes dans « ${key} »`);
      if (!same(tags(other), tags(v))) issues.push(`${locale}: balises HTML différentes dans « ${key} »`);
    }
    // Formes facultatives (ex. _zero en anglais) : tolérées si présentes.
    for (const k of Object.keys(target)) if (pluralBase(k) === group) allowed.add(k);
  }

  for (const key of Object.keys(target)) {
    if (!allowed.has(key)) issues.push(`${locale}: clé inconnue ou obsolète « ${key} »`);
  }
  return issues;
}
