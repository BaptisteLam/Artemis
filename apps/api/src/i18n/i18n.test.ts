/** Règle du projet : les messages envoyés par l'API (emails, push, Slack) existent dans les 24 langues. Voir CLAUDE.md. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, checkTranslation, flatten, type Locale } from '@artemis/i18n';
import { CATALOGS } from './catalogs';

const DIR = join(__dirname, 'messages');
const load = (l: Locale) => flatten(JSON.parse(readFileSync(join(DIR, l, 'notify.json'), 'utf8')));
const checked = (process.env.I18N_LOCALES?.split(',') as Locale[] | undefined) ?? [...LOCALES];

describe("i18n de l'API", () => {
  it.each(checked)('notify complet et cohérent : %s', (l) => {
    expect(readdirSync(DIR)).toContain(l);
    expect(checkTranslation(l, load('en'), load(l))).toEqual([]);
  });
  it('catalogs.ts importe toutes les langues présentes (node scripts/i18n-api-catalogs.mjs)', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual(readdirSync(DIR).sort());
  });
});
