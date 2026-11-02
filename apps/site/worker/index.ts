import { DEFAULT_LOCALE, isLocale, negotiateLocale, parseAcceptLanguage, type Locale } from '@artemis/i18n';

/**
 * Worker placé devant les fichiers statiques du site :
 * - à la première visite d'une page sans préfixe de langue, redirige vers la langue du visiteur
 *   (choix mémorisé > langue du navigateur > pays) ; l'anglais reste à la racine ;
 * - les robots d'indexation ne sont jamais redirigés (chaque langue a son URL et ses balises hreflang) ;
 * - anciennes adresses françaises → nouvelles adresses ;
 * - page 404 dans la langue de l'URL.
 */
export interface Env {
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
}

export const LANG_COOKIE = 'artemis_lang';

/** Anciennes adresses (site d'origine en français) → nouvelles adresses anglaises, en version française. */
export const LEGACY: Record<string, string> = {
  '/fonctionnement': '/fr/how-it-works',
  '/tarifs': '/fr/pricing',
  '/securite': '/fr/security',
  '/agences': '/fr/agencies',
  '/liste-attente': '/fr/waitlist',
  '/mentions-legales': '/fr/legal-notice',
  '/cgv': '/fr/terms',
  '/confidentialite': '/fr/privacy',
  '/ressources/politique-agents': '/fr/resources/agent-policy',
  '/docs/regles': '/fr/docs/rules',
};

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless/i;

function cookie(req: Request, name: string): string | null {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function redirect(location: string, status = 302, extra: Record<string, string> = {}) {
  return new Response(null, { status, headers: { location, vary: 'Accept-Language, Cookie', 'cache-control': 'private, no-store', ...extra } });
}

export function chooseLocale(req: Request): Locale {
  const country = (req as Request & { cf?: { country?: string } }).cf?.country ?? req.headers.get('cf-ipcountry');
  return negotiateLocale({
    preferred: cookie(req, LANG_COOKIE),
    languages: parseAcceptLanguage(req.headers.get('accept-language')),
    country,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const first = path.split('/')[1] ?? '';

    const legacy = LEGACY[path];
    if (legacy) return redirect(legacy + url.search, 301);

    // /en/... n'existe pas : l'anglais est à la racine. On mémorise le choix.
    if (first === DEFAULT_LOCALE) {
      const rest = path.slice(3) || '/';
      return redirect(rest + url.search, 302, { 'set-cookie': `${LANG_COOKIE}=en; Path=/; Max-Age=31536000; SameSite=Lax` });
    }

    const isPage = req.method === 'GET' && !/\.[a-z0-9]+$/i.test(path) && (req.headers.get('accept') ?? '').includes('text/html');
    if (isPage && !isLocale(first) && !BOT.test(req.headers.get('user-agent') ?? '')) {
      const locale = chooseLocale(req);
      if (locale !== DEFAULT_LOCALE) return redirect(`/${locale}${path === '/' ? '/' : path}${url.search}`);
    }

    const res = await env.ASSETS.fetch(req);
    if (res.status !== 404 || !isPage) return res;
    const locale = isLocale(first) ? first : DEFAULT_LOCALE;
    const page = await env.ASSETS.fetch(new URL(locale === DEFAULT_LOCALE ? '/404.html' : `/${locale}/404/`, url).toString());
    return new Response(page.body, { status: 404, headers: page.headers });
  },
};
