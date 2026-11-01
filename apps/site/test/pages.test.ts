import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const PAGES = [
  'index.html',
  'fonctionnement/index.html',
  'tarifs/index.html',
  'securite/index.html',
  'docs/index.html',
  'docs/mcp-claude/index.html',
  'docs/mcp-chatgpt/index.html',
  'docs/n8n/index.html',
  'docs/api/index.html',
  'docs/regles/index.html',
  'mentions-legales/index.html',
  'cgv/index.html',
  'confidentialite/index.html',
  'liste-attente/index.html',
  '404.html',
];

describe('site build', () => {
  it.each(PAGES)('generates %s', (p) => expect(existsSync(resolve(dist, p))).toBe(true));
  it('home carries the signature', () => {
    expect(readFileSync(resolve(dist, 'index.html'), 'utf8')).toContain('Vous gardez le dernier mot');
  });
  it('pricing lists the four plans in euros', () => {
    const html = readFileSync(resolve(dist, 'tarifs/index.html'), 'utf8');
    for (const p of ['Sandbox', 'Builder', 'Team', 'Business', '19', '49', '149']) expect(html).toContain(p);
  });
  it('legal pages mention the VAT exemption', () => {
    expect(readFileSync(resolve(dist, 'cgv/index.html'), 'utf8')).toContain('293 B du CGI');
  });
});
