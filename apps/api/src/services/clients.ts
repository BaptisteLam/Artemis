import { monthBounds } from '@artemis/shared';
import type { ClientRow } from '@artemis/db';
import type { Ctx } from './context';

export interface ClientReport {
  client: { id: string; name: string; billing_email: string | null };
  month: string;
  lines: { date: string; agent: string; merchant: string; purpose: string; amount_cents: number; currency: string; receipt: boolean }[];
  subtotal_cents: number;
  markup_pct: number;
  markup_cents: number;
  total_cents: number;
}

/** Rapport mensuel de refacturation d'un client : achats débités, marge de l'agence, total. */
export async function clientReport(ctx: Ctx, client: ClientRow, month: string): Promise<ClientReport> {
  const { start, end } = monthBounds(month);
  const [txs, agents, receipts] = await Promise.all([
    ctx.store.listTransactions(client.org_id, { from: start, to: end, limit: 10000 }),
    ctx.store.listAgents(client.org_id),
    ctx.store.listReceipts(client.org_id),
  ]);
  const lines: ClientReport['lines'] = [];
  for (const t of txs) {
    if (t.status !== 'posted' || !t.card_id) continue;
    const card = await ctx.store.getCard(t.card_id);
    const req = card ? await ctx.store.getCardRequest(card.request_id) : null;
    if (!req || req.client_id !== client.id) continue;
    lines.push({
      date: t.occurred_at,
      agent: agents.find((a) => a.id === req.agent_id)?.name ?? 'agent supprimé',
      merchant: t.merchant_name,
      purpose: req.purpose,
      amount_cents: Number(t.amount_cents),
      currency: t.currency,
      receipt: receipts.some((r) => r.request_id === req.id),
    });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  const subtotal = lines.reduce((s, l) => s + l.amount_cents, 0);
  const markupPct = Number(client.markup_pct);
  const markup = Math.round((subtotal * markupPct) / 100);
  return {
    client: { id: client.id, name: client.name, billing_email: client.billing_email },
    month,
    lines,
    subtotal_cents: subtotal,
    markup_pct: markupPct,
    markup_cents: markup,
    total_cents: subtotal + markup,
  };
}

const eur = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export function clientReportCsv(r: ClientReport): string {
  const rows = [
    'date;agent;marchand;objet;montant;devise;justificatif',
    ...r.lines.map((l) => [l.date.slice(0, 10), l.agent, l.merchant, l.purpose.replace(/[;\n]/g, ' '), eur(l.amount_cents), l.currency, l.receipt ? 'oui' : 'non'].join(';')),
    '',
    `sous-total;;;;${eur(r.subtotal_cents)};EUR;`,
    `frais de gestion ${r.markup_pct} %;;;;${eur(r.markup_cents)};EUR;`,
    `total à refacturer;;;;${eur(r.total_cents)};EUR;`,
  ];
  return `﻿${rows.join('\r\n')}\r\n`;
}
