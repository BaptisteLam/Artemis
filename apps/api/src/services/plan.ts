import { PLAN_LIMITS, type Plan } from '@artemis/shared';
import type { OrganizationRow } from '@artemis/db';

const ACTIVE = new Set(['active', 'trialing']);

/** Plan réellement appliqué : un abonnement non actif retombe sur Sandbox. */
export function effectivePlan(org: OrganizationRow): Plan {
  if (org.plan === 'sandbox') return 'sandbox';
  return ACTIVE.has(org.subscription_status ?? '') ? org.plan : 'sandbox';
}

export function limitsFor(org: OrganizationRow) {
  return PLAN_LIMITS[effectivePlan(org)];
}
