import type { Ctx } from './context';

export interface ExportRow {
  date: Date;
  agent: string;
  merchant: string;
  purpose: string;
  amountCents: number;
  currency: string;
  status: 'matched' | 'mismatch' | 'unmatched';
  receipt: boolean;
  ref: string;
}

export const FEC_HEADER = [
  'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef',
  'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise',
] as const;

const STATUS_FR = { matched: 'rapprochée', mismatch: 'écart', unmatched: 'non rapprochée' } as const;

function parisYmd(d: Date): { y: string; m: string; d: string } {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { y: g('year'), m: g('month'), d: g('day') };
}
const isoDay = (d: Date) => { const p = parisYmd(d); return `${p.y}-${p.m}-${p.d}`; };
const fecDay = (d: Date) => { const p = parisYmd(d); return `${p.y}${p.m}${p.d}`; };
const amount = (cents: number) => (Math.abs(cents) / 100).toFixed(2).replace('.', ',');
const clean = (s: string, max = 200) => s.replace(/[\t\r\n;]+/g, ' ').trim().slice(0, max);

export function exportCsv(rows: ExportRow[]): string {
  const head = 'date;agent;marchand;montant;devise;statut;justificatif';
  const body = rows.map((r) =>
    [isoDay(r.date), clean(r.agent), clean(r.merchant), amount(r.amountCents), r.currency, STATUS_FR[r.status], r.receipt ? 'oui' : 'non'].join(';'),
  );
  return `﻿${[head, ...body].join('\r\n')}\r\n`;
}

/**
 * Fichier des écritures comptables (FEC, art. A47 A-1 du LPF) : une écriture équilibrée par achat,
 * débit 604000 (achats de prestations) / crédit 512000 (banque). Comptes paramétrables.
 */
export function exportFec(rows: ExportRow[], opts: { journal?: string; expenseAccount?: string; bankAccount?: string } = {}): string {
  const journal = opts.journal ?? 'BQ';
  const expense = opts.expenseAccount ?? '604000';
  const bank = opts.bankAccount ?? '512000';
  const lines: string[] = [FEC_HEADER.join('\t')];
  rows.forEach((r, i) => {
    const num = String(i + 1);
    const day = fecDay(r.date);
    const lib = clean(`${r.merchant} - ${r.purpose}`, 120);
    const foreign = r.currency !== 'EUR';
    const devise = foreign ? amount(r.amountCents) : '';
    const iso = foreign ? r.currency : '';
    const ref = clean(r.ref, 20);
    lines.push([journal, 'Banque', num, day, expense, 'Achats de prestations de services', '', '', ref, day, lib, amount(r.amountCents), '0,00', '', '', day, devise, iso].join('\t'));
    lines.push([journal, 'Banque', num, day, bank, 'Banque', '', '', ref, day, lib, '0,00', amount(r.amountCents), '', '', day, devise, iso].join('\t'));
  });
  return `${lines.join('\r\n')}\r\n`;
}

/** Construit les lignes d'export à partir des transactions débitées sur la période. */
export async function exportRows(ctx: Ctx, orgId: string, from: Date, to: Date): Promise<ExportRow[]> {
  const txs = (await ctx.store.listTransactions(orgId, { from, to, limit: 10000 })).filter((t) => t.status === 'posted' || t.status === 'pending');
  const agents = new Map((await ctx.store.listAgents(orgId)).map((a) => [a.id, a.name]));
  const receipts = await ctx.store.listReceipts(orgId);
  const rows: ExportRow[] = [];
  for (const t of txs) {
    const card = t.card_id ? await ctx.store.getCard(t.card_id) : null;
    const req = card ? await ctx.store.getCardRequest(card.request_id) : null;
    rows.push({
      date: new Date(t.occurred_at),
      agent: req ? (agents.get(req.agent_id) ?? 'agent supprimé') : 'hors Artemis',
      merchant: t.merchant_name,
      purpose: req?.purpose ?? '',
      amountCents: Number(t.amount_cents),
      currency: t.currency,
      status: t.match_status,
      receipt: !!req && receipts.some((r) => r.request_id === req.id),
      ref: (req?.id ?? t.id).slice(0, 8),
    });
  }
  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}
