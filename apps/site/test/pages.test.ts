import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const PAGES = [
  'index.html',
  'how-it-works/index.html',
  'pricing/index.html',
  'security/index.html',
  'docs/index.html',
  'docs/mcp-claude/index.html',
  'docs/mcp-chatgpt/index.html',
  'docs/n8n/index.html',
  'docs/api/index.html',
  'docs/rules/index.html',
  'legal-notice/index.html',
  'terms/index.html',
  'privacy/index.html',
  'waitlist/index.html',
  '404.html',
  'agencies/index.html',
  'docs/cli/index.html',
  'resources/agent-policy/index.html',
];

describe('site build', () => {
  it.each(PAGES)('generates %s', (p) => expect(existsSync(resolve(dist, p))).toBe(true));
  it('home sells control, time, proof and agencies as the European solution', () => {
    const html = readFileSync(resolve(dist, 'index.html'), 'utf8').replace(/&#39;/g, "'");
    for (const t of ['The European solution', 'Not a card', 'Control', 'Time saved', 'Proof', 'For agencies', "Let's be honest", 'Several banks at once', 'Built in Europe']) expect(html).toContain(t);
    const fr = readFileSync(resolve(dist, 'fr/index.html'), 'utf8');
    for (const t of ['La solution européenne', 'Pas une carte', 'Le contrôle', 'Le gain de temps', 'La preuve', 'Pour les agences', 'Soyons honnêtes', 'Plusieurs banques à la fois', 'Conçu en Europe']) expect(fr).toContain(t);
  });
  it('home carries the signature', () => {
    expect(readFileSync(resolve(dist, 'index.html'), 'utf8')).toContain('You keep the final say');
    expect(readFileSync(resolve(dist, 'fr/index.html'), 'utf8')).toContain('Vous gardez le dernier mot');
  });
  it('pricing lists the five plans in euros', () => {
    const html = readFileSync(resolve(dist, 'pricing/index.html'), 'utf8');
    for (const p of ['Sandbox', 'Builder', 'Team', 'Agency', 'Business', '€29', '€99', '€249', '€690', '€0.25']) expect(html).toContain(p);
    const fr = readFileSync(resolve(dist, 'fr/pricing/index.html'), 'utf8').replace(/\s/g, ' ');
    for (const p of ['Agences', '29 €', '0,25 €']) expect(fr).toContain(p);
  });
  it('every page exists in the 24 languages, with hreflang alternates', () => {
    for (const l of ['fr', 'de', 'pl', 'ga', 'mt']) for (const p of PAGES.filter((x) => x !== '404.html')) expect(existsSync(resolve(dist, l, p)), `${l}/${p}`).toBe(true);
    const html = readFileSync(resolve(dist, 'de/pricing/index.html'), 'utf8');
    expect(html).toContain('<html lang="de"');
    expect(html.match(/<link rel="alternate" hreflang=/g)?.length).toBe(25);
  });
  it('legal pages mention the VAT exemption, and that French prevails', () => {
    expect(readFileSync(resolve(dist, 'fr/terms/index.html'), 'utf8')).toContain('293 B du CGI');
    expect(readFileSync(resolve(dist, 'terms/index.html'), 'utf8')).toContain('293 B');
    expect(readFileSync(resolve(dist, 'de/terms/index.html'), 'utf8')).toContain('/fr/terms');
    expect(readFileSync(resolve(dist, 'fr/terms/index.html'), 'utf8')).not.toContain('legal-notice-lang');
  });
});
