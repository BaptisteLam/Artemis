import type { Context } from 'hono';
import { ArtemisError } from '@artemis/shared';

const SENSITIVE = /\b\d{13,19}\b/g;

/** Journalise sans jamais écrire un numéro de carte. */
export function safeLog(label: string, err: unknown) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(label, msg.replace(SENSITIVE, '[redacted]'));
}

export function errorResponse(c: Context, err: unknown) {
  if (err instanceof ArtemisError) {
    return c.json(err.toJSON(), err.status as 400);
  }
  safeLog('unhandled', err);
  return c.json({ error: { code: 'internal', message: 'Erreur interne. Réessayez.' } }, 500);
}
