import { ArtemisError } from '@artemis/shared';
import type { Ctx } from './context';
import { verifyAuditChain } from './audit';

function quarterBounds(q: string) {
  const m = /^(\d{4})-Q([1-4])$/.exec(q);
  if (!m) throw new ArtemisError('invalid_input', 'quarter doit être au format AAAA-Qn (ex. 2026-Q4).');
  const y = Number(m[1]);
  const start = new Date(Date.UTC(y, (Number(m[2]) - 1) * 3, 1));
  const end = new Date(Date.UTC(y, Number(m[2]) * 3, 1));
  return { start, end };
}

export const OVERSIGHT_STATEMENT =
  "Conformément à l'article 14 du règlement (UE) 2024/1689 (AI Act) relatif au contrôle humain, aucune dépense d'agent ne peut être exécutée hors des règles définies par l'organisation ; au-delà des seuils de validation automatique, chaque dépense est soumise à la signature préalable d'une personne habilitée (passkey WebAuthn sur l'empreinte SHA-256 du mandat). Toutes les décisions sont consignées dans un journal chaîné par hachage, en insertion seule.";

/** Rapport trimestriel de supervision humaine (registre des agents, statistiques, intégrité du journal). */
export async function complianceReport(ctx: Ctx, orgId: string, quarter: string) {
  const { start, end } = quarterBounds(quarter);
  const org = await ctx.store.getOrganization(orgId);
  if (!org) throw new ArtemisError('not_found', 'Organisation introuvable.');
  const [agents, requests, members, auditAll, clients] = await Promise.all([
    ctx.store.listAgents(orgId),
    ctx.store.listCardRequests(orgId, { from: start, to: end, limit: 100000 }),
    ctx.store.listMembers(orgId),
    ctx.store.listAllAudit(orgId),
    ctx.store.listClients(orgId),
  ]);
  const mandates = await Promise.all(requests.map((r) => ctx.store.getMandate(r.id)));
  const inPeriod = auditAll.filter((a) => a.created_at >= start.toISOString() && a.created_at < end.toISOString());
  const rejectedByRules = requests.filter((r) => r.status === 'rejected' && !r.decision_reason?.startsWith('human:')).length;
  const rejectedByHuman = requests.filter((r) => r.status === 'rejected' && r.decision_reason?.startsWith('human:')).length;
  const reasons: Record<string, number> = {};
  for (const r of requests) {
    if (r.status !== 'rejected' || !r.decision_reason) continue;
    const code = r.decision_reason.split(':')[0]!;
    reasons[code] = (reasons[code] ?? 0) + 1;
  }
  const policies = await Promise.all(agents.map((a) => ctx.store.getPolicy(a.id)));
  return {
    organization: { id: org.id, name: org.name },
    period: { quarter, from: start.toISOString(), to: end.toISOString() },
    generated_at: ctx.now().toISOString(),
    statement: OVERSIGHT_STATEMENT,
    agents: agents.map((a, i) => ({
      id: a.id,
      name: a.name,
      platform: a.platform,
      status: a.status,
      client: clients.find((c) => c.id === a.client_id)?.name ?? null,
      created_at: a.created_at,
      policy: policies[i]
        ? {
            monthly_budget_cents: Number(policies[i]!.monthly_budget_cents),
            per_tx_limit_cents: Number(policies[i]!.per_tx_limit_cents),
            auto_approve_below_cents: Number(policies[i]!.auto_approve_below_cents),
            merchant_allow: policies[i]!.merchant_allow,
            approvals_required: policies[i]!.approvals_required ?? 1,
          }
        : null,
    })),
    approvers: members.filter((m) => m.role !== 'viewer').map((m) => ({ email: m.email, role: m.role })),
    stats: {
      requests: requests.length,
      human_approved: mandates.filter((m) => m && !m.auto_approved).length,
      auto_approved: mandates.filter((m) => m?.auto_approved).length,
      rejected_by_rules: rejectedByRules,
      rejected_by_human: rejectedByHuman,
      rejection_reasons: reasons,
      amount_approved_cents: requests.filter((r) => ['approved', 'issued', 'completed'].includes(r.status)).reduce((s, r) => s + Number(r.amount_cents), 0),
      freezes: inPeriod.filter((a) => a.action === 'agent.frozen' || a.action === 'org.frozen').length,
      mismatches: inPeriod.filter((a) => a.action === 'transaction.mismatch').length,
    },
    audit: { ...(await verifyAuditChain(auditAll)), entries_in_period: inPeriod.length },
  };
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const eur = (c: number) => `${(c / 100).toFixed(2).replace('.', ',')} €`;

export function complianceReportHtml(r: Awaited<ReturnType<typeof complianceReport>>): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport de supervision ${esc(r.period.quarter)} — ${esc(r.organization.name)}</title>
<style>body{font:14px/1.5 Helvetica,Arial,sans-serif;color:#171818;max-width:820px;margin:40px auto;padding:0 16px}h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;border-bottom:2px solid #0000ff;padding-bottom:4px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:6px;border-bottom:1px solid #ddd;font-size:13px}.muted{color:#45474d}.ok{color:#0a5540}.ko{color:#8a2a08}@media print{body{margin:0}}</style></head><body>
<p class="muted">Artemis · rapport de supervision humaine des agents IA</p>
<h1>${esc(r.organization.name)} — ${esc(r.period.quarter)}</h1>
<p class="muted">Période du ${esc(r.period.from.slice(0, 10))} au ${esc(r.period.to.slice(0, 10))} (exclu) · généré le ${esc(r.generated_at.slice(0, 16).replace('T', ' '))} UTC</p>
<h2>Déclaration de contrôle humain</h2><p>${esc(r.statement)}</p>
<h2>Synthèse</h2><table>
<tr><td>Demandes de dépense</td><td>${r.stats.requests}</td></tr>
<tr><td>Validées par un humain (passkey)</td><td>${r.stats.human_approved}</td></tr>
<tr><td>Validées automatiquement (règles)</td><td>${r.stats.auto_approved}</td></tr>
<tr><td>Refusées par les règles</td><td>${r.stats.rejected_by_rules}</td></tr>
<tr><td>Refusées par un humain</td><td>${r.stats.rejected_by_human}</td></tr>
<tr><td>Montant autorisé</td><td>${eur(r.stats.amount_approved_cents)}</td></tr>
<tr><td>Gels d'urgence ou automatiques</td><td>${r.stats.freezes}</td></tr>
<tr><td>Écarts détectés au rapprochement</td><td>${r.stats.mismatches}</td></tr></table>
<h2>Registre des agents</h2><table><tr><th>Agent</th><th>Plateforme</th><th>Client</th><th>Statut</th><th>Budget mensuel</th><th>Plafond / achat</th><th>Signatures</th></tr>
${r.agents.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.platform)}</td><td>${esc(a.client ?? '—')}</td><td>${esc(a.status)}</td><td>${a.policy ? eur(a.policy.monthly_budget_cents) : '—'}</td><td>${a.policy ? eur(a.policy.per_tx_limit_cents) : '—'}</td><td>${a.policy?.approvals_required ?? 1}</td></tr>`).join('')}</table>
<h2>Personnes habilitées</h2><table>${r.approvers.map((m) => `<tr><td>${esc(m.email)}</td><td>${esc(m.role)}</td></tr>`).join('')}</table>
<h2>Intégrité du journal d'audit</h2><p class="${r.audit.ok ? 'ok' : 'ko'}">${r.audit.ok ? `Chaîne intègre : ${r.audit.count} entrées vérifiées (SHA-256 chaîné), dont ${r.audit.entries_in_period} sur la période.` : `Chaîne rompue à l'entrée ${r.audit.brokenAt}.`}</p>
</body></html>`;
}
