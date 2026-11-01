const SUFFIXES = /\b(inc|ltd|limited|sas|sarl|sa|gmbh|llc|labs|corp|co)\b/g;
const TLDS = /\.(com|so|io|fr|eu|ai|dev|app|co|net|org)\b/g;

export function normalizeMerchant(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(TLDS, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, '');
}

export function merchantMatches(candidate: string, pattern: string): boolean {
  const p = normalizeMerchant(pattern);
  if (!p) return false;
  return normalizeMerchant(candidate).includes(p);
}
