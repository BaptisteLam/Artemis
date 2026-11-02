/**
 * Règle du projet : TOUT texte visible de l'app doit être traduisible et traduit dans les 24 langues.
 * Ce test bloque la CI sinon. Voir CLAUDE.md.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { LOCALES, checkTranslation, mergeFlat, type Locale, type Messages } from '@artemis/i18n';
import { lintScript } from '@artemis/i18n/lint';

const SRC = resolve(__dirname, '..');
const MESSAGES = join(__dirname, 'messages');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'messages' ? [] : files(p);
    return /\.(tsx?)$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f) && !f.endsWith('.d.ts') ? [p] : [];
  });
}

function catalog(locale: Locale) {
  let list: string[];
  try {
    list = readdirSync(join(MESSAGES, locale)).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }
  return mergeFlat(...list.sort().map((f) => JSON.parse(readFileSync(join(MESSAGES, locale, f), 'utf8')) as Messages));
}

const checked = (process.env.I18N_LOCALES?.split(',') as Locale[] | undefined) ?? [...LOCALES];

describe("i18n de l'app", () => {
  it('aucun texte écrit en dur', () => {
    const findings: string[] = [];
    for (const f of files(SRC)) {
      for (const x of lintScript(readFileSync(f, 'utf8'), f, f.endsWith('.tsx'))) findings.push(`${relative(SRC, f)}:${x.line}  ${x.text}`);
    }
    expect(findings, `Texte non traduisible : utilisez t('clé') et ajoutez la clé dans src/i18n/messages/<langue>/*.json\n${findings.join('\n')}`).toEqual([]);
  });

  it('les mêmes fichiers de messages existent dans chaque langue', () => {
    const en = readdirSync(join(MESSAGES, 'en')).sort();
    for (const l of checked) expect(readdirSync(join(MESSAGES, l)).sort(), l).toEqual(en);
  });

  it.each(checked)('traduction complète et cohérente : %s', (l) => {
    const target = catalog(l);
    expect(target, `dossier src/i18n/messages/${l} manquant`).not.toBeNull();
    expect(checkTranslation(l, catalog('en')!, target!)).toEqual([]);
  });
});
