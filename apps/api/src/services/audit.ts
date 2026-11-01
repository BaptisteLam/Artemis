import { canonicalJson, sha256Hex } from '@artemis/shared';
import type { AuditRow } from '@artemis/db';
import type { Ctx } from './context';

export type Actor = { type: 'user' | 'agent' | 'system'; id: string };

function canonicalOf(e: Pick<AuditRow, 'org_id' | 'actor_type' | 'actor_id' | 'action' | 'subject' | 'data'>): string {
  return canonicalJson({ org_id: e.org_id, actor_type: e.actor_type, actor_id: e.actor_id, action: e.action, subject: e.subject, data: e.data });
}

/** Ajoute une entrée au journal chaîné. `data` ne doit jamais contenir de numéro de carte. */
export async function audit(ctx: Ctx, orgId: string, actor: Actor, action: string, subject: string, data: Record<string, unknown> = {}) {
  const entry = {
    org_id: orgId,
    actor_type: actor.type,
    actor_id: actor.id,
    action,
    subject,
    data: { ...data, at: ctx.now().toISOString() },
  };
  return ctx.store.appendAudit({ ...entry, canonical: canonicalOf(entry) });
}

/** Recalcule la chaîne : chaque hash = SHA-256(hash précédent + JSON canonique de l'entrée). */
export async function verifyAuditChain(entries: AuditRow[]): Promise<{ ok: boolean; brokenAt?: number; count: number }> {
  let prev: string | null = null;
  for (const e of entries) {
    const expected = await sha256Hex((prev ?? '') + canonicalOf(e));
    if (e.prev_hash !== prev || e.hash !== expected) return { ok: false, brokenAt: e.id, count: entries.length };
    prev = e.hash;
  }
  return { ok: true, count: entries.length };
}
