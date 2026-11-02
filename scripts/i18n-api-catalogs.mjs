#!/usr/bin/env node
// Régénère apps/api/src/i18n/catalogs.ts à partir des dossiers de langues présents (imports statiques pour le Worker).
import { readdirSync, writeFileSync } from 'node:fs';
const dir = new URL('../apps/api/src/i18n/messages/', import.meta.url);
const langs = readdirSync(dir).filter((d) => /^[a-z]{2}$/.test(d)).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
const lines = [
  '// Catalogues de l\'API (emails, push, Slack). Fichier régénéré par scripts/i18n-api-catalogs.mjs : ne pas éditer à la main.',
  "import type { Locale, Messages } from '@artemis/i18n';",
  ...langs.map((l) => `import ${l} from './messages/${l}/notify.json';`),
  '',
  `export const CATALOGS: Partial<Record<Locale, Messages>> = { ${langs.join(', ')} };`,
  '',
];
writeFileSync(new URL('../catalogs.ts', dir), lines.join('\n'));
console.log(`catalogs.ts : ${langs.length} langues`);
