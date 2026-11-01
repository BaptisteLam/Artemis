import { describe, expect, it } from 'vitest';
import { exportCsv, exportFec, FEC_HEADER, type ExportRow } from './exports';

const rows: ExportRow[] = [
  { date: new Date('2026-11-03T09:00:00Z'), agent: 'notion.agent', merchant: 'Notion', purpose: 'abonnement\téquipe', amountCents: 4900, currency: 'EUR', status: 'matched', receipt: true, ref: 'abcd1234' },
  { date: new Date('2026-11-04T23:30:00Z'), agent: 'api.agent', merchant: 'OpenAI', purpose: 'crédits API', amountCents: 2000, currency: 'USD', status: 'mismatch', receipt: false, ref: 'efgh5678' },
];

describe('exports', () => {
  it('CSV uses semicolons, a BOM and French amounts', () => {
    const csv = exportCsv(rows);
    expect(csv.startsWith('﻿date;agent;marchand;montant;devise;statut;justificatif\r\n')).toBe(true);
    expect(csv).toContain('2026-11-03;notion.agent;Notion;49,00;EUR;rapprochée;oui');
  });
  it('FEC has the 18 official columns', () => {
    const fec = exportFec(rows);
    const lines = fec.trim().split('\r\n');
    expect(lines[0]).toBe(FEC_HEADER.join('\t'));
    expect(FEC_HEADER.join('\t')).toBe('JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise');
    for (const l of lines) expect(l.split('\t')).toHaveLength(18);
  });
  it('FEC writes a balanced two-line entry per purchase', () => {
    const lines = exportFec(rows).trim().split('\r\n').slice(1).map((l) => l.split('\t'));
    expect(lines).toHaveLength(4);
    const [debit, credit] = lines;
    expect(debit![0]).toBe('BQ');
    expect(debit![2]).toBe('1');
    expect(debit![3]).toBe('20261103');
    expect(debit![4]).toBe('604000');
    expect(debit![11]).toBe('49,00');
    expect(credit![4]).toBe('512000');
    expect(credit![12]).toBe('49,00');
    expect(debit![10]).not.toContain('\t');
    // Date de Paris : 23h30 UTC le 4 = le 5 à Paris
    expect(lines[2]![3]).toBe('20261105');
    expect(lines[2]![16]).toBe('20,00');
    expect(lines[2]![17]).toBe('USD');
  });
});
