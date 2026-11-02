import { describe, expect, it } from 'vitest';
import {
  LOCALES,
  LOCALE_NAMES,
  checkTranslation,
  createTranslator,
  flatten,
  formatMoney,
  negotiateLocale,
  parseAcceptLanguage,
  requiredPluralCategories,
} from './index';

describe('locales', () => {
  it('covers the 24 official EU languages, English first', () => {
    expect(LOCALES).toHaveLength(24);
    expect(LOCALES[0]).toBe('en');
    for (const l of LOCALES) expect(LOCALE_NAMES[l]).toBeTruthy();
  });
});

describe('negotiateLocale', () => {
  it('prefers an explicit choice', () => {
    expect(negotiateLocale({ preferred: 'de', languages: ['fr-FR'], country: 'IT' })).toBe('de');
  });
  it('then the first supported browser language', () => {
    expect(negotiateLocale({ languages: parseAcceptLanguage('nb-NO,nb;q=0.9,pl;q=0.8,en;q=0.5'), country: 'NO' })).toBe('pl');
    expect(negotiateLocale({ languages: ['de-AT'] })).toBe('de');
  });
  it('then the country the page is opened from', () => {
    expect(negotiateLocale({ languages: ['ja-JP'], country: 'PT' })).toBe('pt');
    expect(negotiateLocale({ languages: [], country: 'gr' })).toBe('el');
  });
  it('falls back to English', () => {
    expect(negotiateLocale({ languages: ['ja'], country: 'JP' })).toBe('en');
    expect(negotiateLocale({ preferred: 'xx' })).toBe('en');
  });
  it('orders Accept-Language by quality', () => {
    expect(parseAcceptLanguage('en;q=0.3, fr-BE, de;q=0.8, *;q=0.1')).toEqual(['fr-BE', 'de', 'en']);
  });
});

describe('createTranslator', () => {
  const en = flatten({ nav: { pricing: 'Pricing' }, hello: 'Hello {name}', cards_one: '{count} card', cards_other: '{count} cards' });
  const pl = flatten({ nav: { pricing: 'Cennik' }, cards_one: '{count} karta', cards_few: '{count} karty', cards_many: '{count} kart', cards_other: '{count} karty' });
  it('translates, interpolates and falls back to English', () => {
    const t = createTranslator('pl', pl, en);
    expect(t('nav.pricing')).toBe('Cennik');
    expect(t('hello', { name: 'Ana' })).toBe('Hello Ana');
    expect(t('missing.key')).toBe('missing.key');
  });
  it('uses the plural rules of each language', () => {
    const t = createTranslator('pl', pl, en);
    expect(t('cards', { count: 1 })).toBe('1 karta');
    expect(t('cards', { count: 3 })).toBe('3 karty');
    expect(t('cards', { count: 5 })).toBe('5 kart');
    expect(createTranslator('en', en)('cards', { count: 2 })).toBe('2 cards');
  });
});

describe('checkTranslation', () => {
  const base = flatten({ a: 'Hi {name}', b: 'Read <strong>this</strong>', items_one: '{count} item', items_other: '{count} items' });
  it('accepts a complete translation', () => {
    const fr = flatten({ a: 'Salut {name}', b: 'Lisez <strong>ceci</strong>', items_one: '{count} élément', items_many: '{count} d’éléments', items_other: '{count} éléments' });
    expect(checkTranslation('fr', base, fr)).toEqual([]);
  });
  it('reports missing, empty, stale keys, variables, tags and plural forms', () => {
    const bad = flatten({ a: 'Salut {nom}', b: 'Lisez ceci', items_other: '{count} karty', old: 'x' });
    const issues = checkTranslation('pl', base, bad).join('\n');
    expect(issues).toMatch(/variables différentes dans « a »/);
    expect(issues).toMatch(/balises HTML différentes dans « b »/);
    expect(issues).toMatch(/pluriel manquante « items_few »/);
    expect(issues).toMatch(/obsolète « old »/);
    expect(checkTranslation('de', base, {}).join('\n')).toMatch(/clé manquante « a »/);
  });
  it('knows the plural categories of every language', () => {
    expect(requiredPluralCategories('pl')).toEqual(expect.arrayContaining(['one', 'few', 'many', 'other']));
    expect(requiredPluralCategories('ga')).toEqual(expect.arrayContaining(['one', 'two', 'few', 'many', 'other']));
  });
});

describe('formatMoney', () => {
  it('formats euros per language', () => {
    expect(formatMoney('en', 4900)).toBe('€49.00');
    expect(formatMoney('fr', 4900).replace(/\s/g, ' ')).toBe('49,00 €');
    expect(formatMoney('de', -1050).replace(/\s/g, ' ')).toBe('−10,50 €');
    expect(formatMoney('en', 2900, 'EUR', { whole: true })).toBe('€29');
  });
});

describe('lint (texte en dur)', async () => {
  const { lintAstro, lintScript, looksLikeProse } = await import('./lint');
  it('flags raw text in Astro and accepts t() calls, code and brand names', async () => {
    expect(await lintAstro('---\nconst a = 1;\n---\n<p>Bonjour</p><p>{t("x")}</p><code>npm install</code><span>Claude · n8n</span>')).toEqual([{ line: 4, text: 'Bonjour' }]);
    expect(await lintAstro('<div data-i18n-ignore><p>Brut</p></div>')).toEqual([]);
    expect((await lintAstro('---\nconst items = ["Sans traduction ici"];\n---\n<p/>')).map((f) => f.line)).toEqual([2]);
  });
  it('flags JSX text, text attributes and prose strings', () => {
    const src = 'export const A = () => <div title="Bonjour toi"><p>Salut</p>{t("k")}<code>x y</code><p className="ar-btn ar-btn-primary"/></div>;\nconst e = new Error("Une erreur est survenue.");\nconst ok = "Une phrase volontaire"; // i18n-ignore';
    expect(lintScript(src).map((f) => f.text)).toEqual(['title="Bonjour toi"', 'Salut', 'Une erreur est survenue.']);
  });
  it('distinguishes prose from code-like strings', () => {
    expect(looksLikeProse('ar-container section docs-layout')).toBe(false);
    expect(looksLikeProse('/agents/new')).toBe(false);
    expect(looksLikeProse('Create an agent')).toBe(true);
    expect(looksLikeProse('Désactiver')).toBe(true);
  });
});
