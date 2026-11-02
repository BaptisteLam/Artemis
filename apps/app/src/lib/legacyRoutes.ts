/** Anciennes adresses françaises de l'app → nouvelles adresses anglaises. */
const LEGACY: [string, string][] = [
  ['/agents/nouveau', '/agents/new'],
  ['/connexion', '/login'],
  ['/inscription', '/signup'],
  ['/bienvenue', '/welcome'],
  ['/banques', '/banks'],
  ['/demandes', '/requests'],
  ['/cartes', '/cards'],
  ['/equipe', '/team'],
  ['/reglages', '/settings'],
  ['/facturation', '/billing'],
  ['/abonnements', '/subscriptions'],
];

export function legacyRedirect(pathname: string, search = '', hash = ''): string | null {
  for (const [from, to] of LEGACY) {
    if (pathname === from || pathname.startsWith(`${from}/`)) {
      const q = search.replace('statut=annule', 'status=canceled').replace('statut=', 'status=');
      return to + pathname.slice(from.length) + q + hash.replace('#urgence', '#emergency');
    }
  }
  return null;
}
