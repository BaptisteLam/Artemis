import type { AgentRow, BankConnectionRow } from '@artemis/db';

export function publicAgent(a: AgentRow) {
  const { token_hash: _h, ...rest } = a;
  return rest;
}

export function publicConnection(c: BankConnectionRow) {
  const { credentials_ciphertext: _c, ...rest } = c;
  return rest;
}

export function parseDay(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? fallback : d;
}
