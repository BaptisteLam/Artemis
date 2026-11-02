/**
 * Règle du projet : TOUT texte visible du site (pages, blog, articles, composants…) doit être traduisible
 * et traduit dans les 24 langues. Ce test bloque la CI sinon. Voir CLAUDE.md.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { LOCALES, checkTranslation, mergeFlat, type Locale, type Messages } from '@artemis/i18n';
import { lintAstro, lintScript } from '@artemis/i18n/lint';

const SRC = resolve(process.cwd(), 'src');
const MESSAGES = join(SRC, 'i18n/messages');

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(f) ? [p] : [];
  });
}

function catalog(locale: Locale) {
  let list: string[] = [];
  try {
    list = readdirSync(join(MESSAGES, locale)).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }
  return mergeFlat(...list.sort().map((f) => JSON.parse(readFileSync(join(MESSAGES, locale, f), 'utf8')) as Messages));
}

/** Langues vérifiées (toutes par défaut ; I18N_LOCALES=en,fr pour un contrôle partiel en cours de travail). */
const checked = (process.env.I18N_LOCALES?.split(',') as Locale[] | undefined) ?? [...LOCALES];

describe('i18n du site', () => {
  it('aucun texte écrit en dur dans les pages et composants', async () => {
    const findings: string[] = [];
    for (const f of files(SRC, /\.astro$/)) {
      for (const x of await lintAstro(readFileSync(f, 'utf8'))) findings.push(`${relative(SRC, f)}:${x.line}  ${x.text}`);
    }
    for (const f of files(SRC, /\.ts$/).filter((f) => !f.includes('/i18n/') && !f.endsWith('.d.ts'))) {
      for (const x of lintScript(readFileSync(f, 'utf8'), f, false)) findings.push(`${relative(SRC, f)}:${x.line}  ${x.text}`);
    }
    expect(findings, `Texte non traduisible : utilisez t('clé') et ajoutez la clé dans i18n/messages/<langue>/*.json\n${findings.join('\n')}`).toEqual([]);
  });

  it('les mêmes fichiers de messages existent dans chaque langue', () => {
    const en = readdirSync(join(MESSAGES, 'en')).sort();
    for (const l of checked) expect(readdirSync(join(MESSAGES, l)).sort(), l).toEqual(en);
  });

  it.each(checked)('traduction complète et cohérente : %s', (l) => {
    const base = catalog('en')!;
    const target = catalog(l);
    expect(target, `dossier i18n/messages/${l} manquant`).not.toBeNull();
    expect(checkTranslation(l, base, target!)).toEqual([]);
  });
});

describe('blog et articles', () => {
  const BLOG = join(SRC, 'content/blog');
  it('chaque article existe dans les 24 langues', () => {
    let en: string[] = [];
    try {
      en = readdirSync(join(BLOG, 'en')).sort();
    } catch {
      return; // pas encore de blog
    }
    for (const l of checked) {
      let list: string[] = [];
      try {
        list = readdirSync(join(BLOG, l)).sort();
      } catch {
        /* dossier absent */
      }
      expect(list, `articles manquants dans content/blog/${l}`).toEqual(en);
    }
  });
});
