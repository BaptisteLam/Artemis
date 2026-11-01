const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { style: 'currency', currency });
    formatters.set(currency, f);
  }
  return f;
}

/** Formate un montant en centimes au format français : `49,00 €`, `−42,10 €`. */
export function formatAmount(cents: number, currency = 'EUR', opts: { sign?: boolean } = {}): string {
  const abs = formatter(currency).format(Math.abs(cents) / 100);
  if (cents < 0) return `−${abs}`;
  if (opts.sign && cents > 0) return `+${abs}`;
  return abs;
}

/** Convertit une saisie en euros (« 49,90 », « 49.9 ») en centimes, ou null si invalide. */
export function parseEurosToCents(input: string): number | null {
  const clean = input.replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}
