import { Hono } from 'hono';
import { ArtemisError } from '@artemis/shared';
import type { AppEnv } from '../../http/types';
import { ANY_ROLE, requireRole } from '../../http/auth';
import { verifyAuditChain } from '../../services/audit';
import { exportCsv, exportFec, exportRows } from '../../services/exports';
import { limitsFor } from '../../services/plan';
import { parseDay } from './shared';
import { complianceReport, complianceReportHtml } from '../../services/compliance';
import { listSubscriptions } from '../../services/subscriptions';

export const complianceRoutes = new Hono<AppEnv>();

complianceRoutes.get('/audit', requireRole(...ANY_ROLE), async (c) => {
  const before = Number(c.req.query('before') ?? 0) || undefined;
  return c.json({ entries: await c.var.ctx.store.listAudit(c.var.org.id, { beforeId: before, limit: 100 }) });
});

complianceRoutes.get('/audit/verify', requireRole(...ANY_ROLE), async (c) =>
  c.json(await verifyAuditChain(await c.var.ctx.store.listAllAudit(c.var.org.id))),
);

complianceRoutes.get('/audit/export', requireRole('owner', 'admin'), async (c) => {
  if (!limitsFor(c.var.org).auditExport) throw new ArtemisError('plan_limit', "L'export du journal est inclus dans le plan Business.");
  const entries = await c.var.ctx.store.listAllAudit(c.var.org.id);
  const verification = await verifyAuditChain(entries);
  const mandates = await Promise.all(
    [...new Set(entries.filter((e) => e.action === 'request.approved').map((e) => e.subject))].map((id) => c.var.ctx.store.getMandate(id)),
  );
  const doc = {
    organization: { id: c.var.org.id, name: c.var.org.name },
    generated_at: c.var.ctx.now().toISOString(),
    hash_algorithm: 'sha256(prev_hash || canonical_json(entry))',
    verification,
    entries,
    mandates: mandates.filter(Boolean),
  };
  return new Response(JSON.stringify(doc, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="artemis-journal-${c.var.org.id.slice(0, 8)}.json"`,
    },
  });
});

function range(c: { req: { query: (k: string) => string | undefined }; var: AppEnv['Variables'] }) {
  const now = c.var.ctx.now();
  const from = parseDay(c.req.query('from'), new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const to = parseDay(c.req.query('to'), now);
  if (to <= from) throw new ArtemisError('invalid_input', 'La date de fin doit suivre la date de début.');
  return { from, to };
}

complianceRoutes.get('/exports/csv', requireRole(...ANY_ROLE), async (c) => {
  const { from, to } = range(c);
  const csv = exportCsv(await exportRows(c.var.ctx, c.var.org.id, from, to));
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="artemis-depenses.csv"` },
  });
});

complianceRoutes.get('/exports/fec', requireRole(...ANY_ROLE), async (c) => {
  if (!limitsFor(c.var.org).fec) throw new ArtemisError('plan_limit', "L'export FEC est inclus à partir du plan Team.");
  const { from, to } = range(c);
  const fec = exportFec(await exportRows(c.var.ctx, c.var.org.id, from, to));
  return new Response(fec, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="FEC-artemis.txt"` },
  });
});

complianceRoutes.get('/subscriptions', requireRole(...ANY_ROLE), async (c) => c.json({ subscriptions: await listSubscriptions(c.var.ctx, c.var.org.id) }));

complianceRoutes.get('/compliance/report', requireRole('owner', 'admin'), async (c) => {
  if (!limitsFor(c.var.org).auditExport) throw new ArtemisError('plan_limit', 'Le dossier AI Act est inclus dans le plan Business.');
  const now = c.var.ctx.now();
  const quarter = c.req.query('quarter') ?? `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
  const report = await complianceReport(c.var.ctx, c.var.org.id, quarter);
  if (c.req.query('format') === 'html') {
    return new Response(complianceReportHtml(report), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="artemis-supervision-${quarter}.html"` } });
  }
  return c.json(report);
});
