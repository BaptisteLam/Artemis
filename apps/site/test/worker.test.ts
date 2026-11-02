import { describe, expect, it } from 'vitest';
import worker, { chooseLocale } from '../worker/index';

const assets = {
  fetch: async (req: Request | string) => {
    const url = new URL(typeof req === 'string' ? req : req.url);
    if (url.pathname === '/missing' || url.pathname === '/de/missing') return new Response('nope', { status: 404 });
    return new Response(`asset:${url.pathname}`, { status: 200, headers: { 'content-type': 'text/html' } });
  },
};

const page = (path: string, headers: Record<string, string> = {}, cf?: { country: string }) => {
  const req = new Request(`https://artemis.example${path}`, { headers: { accept: 'text/html', ...headers } });
  if (cf) Object.defineProperty(req, 'cf', { value: cf });
  return req;
};

describe('site worker', () => {
  it('redirects a first visit to the browser language', async () => {
    const res = await worker.fetch(page('/pricing', { 'accept-language': 'de-DE,de;q=0.9,en;q=0.8' }), { ASSETS: assets });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/de/pricing');
  });
  it('uses the country when the browser language is not supported', async () => {
    const res = await worker.fetch(page('/', { 'accept-language': 'ja' }, { country: 'PL' }), { ASSETS: assets });
    expect(res.headers.get('location')).toBe('/pl/');
  });
  it('keeps English at the root and respects an explicit choice', async () => {
    expect((await worker.fetch(page('/', { 'accept-language': 'en-GB' }, { country: 'FR' }), { ASSETS: assets })).status).toBe(200);
    expect((await worker.fetch(page('/', { 'accept-language': 'fr', cookie: 'artemis_lang=en' }), { ASSETS: assets })).status).toBe(200);
    expect(chooseLocale(page('/', { 'accept-language': 'en', cookie: 'artemis_lang=sv' }))).toBe('sv');
  });
  it('never redirects crawlers, assets or already localised pages', async () => {
    expect((await worker.fetch(page('/', { 'accept-language': 'it', 'user-agent': 'Googlebot/2.1' }), { ASSETS: assets })).status).toBe(200);
    expect((await worker.fetch(page('/fr/pricing', { 'accept-language': 'de' }), { ASSETS: assets })).status).toBe(200);
    const css = new Request('https://artemis.example/_astro/site.css', { headers: { 'accept-language': 'de' } });
    expect((await worker.fetch(css, { ASSETS: assets })).status).toBe(200);
  });
  it('redirects /en/... to the root and remembers the choice', async () => {
    const res = await worker.fetch(page('/en/pricing'), { ASSETS: assets });
    expect(res.headers.get('location')).toBe('/pricing');
    expect(res.headers.get('set-cookie')).toContain('artemis_lang=en');
  });
  it('maps the old French addresses', async () => {
    const res = await worker.fetch(page('/tarifs'), { ASSETS: assets });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/fr/pricing');
  });
  it('serves the 404 page in the language of the URL', async () => {
    const res = await worker.fetch(page('/de/missing'), { ASSETS: assets });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('asset:/de/404/');
  });
});
