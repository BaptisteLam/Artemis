import { merchantMatches } from '@artemis/shared';
import type { BankTransaction } from '@artemis/connectors';
import type { BankConnectionRow, CardRequestRow, MatchStatus, TransactionRow } from '@artemis/db';
import type { Ctx } from './context';
import { audit } from './audit';
import { connectorFor } from './banks';

/** Compare une transaction au mandat : montant ≤ montant validé et même marchand. */
export function reconcile(
  tx: Pick<TransactionRow, 'amount_cents' | 'merchant_name' | 'status'>,
  request: Pick<CardRequestRow, 'amount_cents' | 'merchant'>,
): MatchStatus {
  if (tx.status === 'declined' || tx.status === 'reversed') return 'unmatched';
  if (Number(tx.amount_cents) > Number(request.amount_cents)) return 'mismatch';
  if (!merchantMatches(tx.merchant_name, request.merchant)) return 'mismatch';
  return 'matched';
}

/** Enregistre une transaction bancaire et la rapproche de sa demande (idempotent). */
export async function applyBankTransaction(ctx: Ctx, conn: BankConnectionRow, t: BankTransaction) {
  const { store } = ctx;
  const card = await store.getCardByProviderId(conn.id, t.providerCardId);
  const row = await store.upsertTransaction({
    org_id: conn.org_id,
    card_id: card?.id ?? null,
    provider_tx_id: t.providerTxId,
    bank_connection_id: conn.id,
    amount_cents: t.amountCents,
    currency: t.currency,
    merchant_name: t.merchantName,
    mcc: t.mcc ?? null,
    status: t.status,
    occurred_at: t.occurredAt.toISOString(),
  });
  if (row.match_status !== 'unmatched' || !card) return row;
  const request = await store.getCardRequest(card.request_id);
  if (!request) return row;
  const status = reconcile(row, request);
  if (status === 'unmatched') return row;
  await store.updateTransaction(row.id, { match_status: status });
  if (status === 'matched') {
    await store.updateCard(card.id, { status: 'used' });
    await store.updateCardRequest(request.id, { status: 'completed' }, 'issued');
    await audit(ctx, conn.org_id, { type: 'system', id: 'reconcile' }, 'transaction.matched', request.id, {
      transaction_id: row.id,
      amount_cents: Number(row.amount_cents),
    });
  } else {
    await audit(ctx, conn.org_id, { type: 'system', id: 'reconcile' }, 'transaction.mismatch', request.id, {
      transaction_id: row.id,
      amount_cents: Number(row.amount_cents),
      merchant_name: row.merchant_name,
    });
    const policy = await store.getPolicy(request.agent_id);
    if (policy?.freeze_on_mismatch) {
      await store.updateAgent(request.agent_id, { status: 'frozen' });
      await audit(ctx, conn.org_id, { type: 'system', id: 'reconcile' }, 'agent.frozen', request.agent_id, { reason: 'mismatch' });
    }
    ctx.defer(ctx.notify.transactionMismatch(conn.org_id, row.id));
  }
  return { ...row, match_status: status };
}

export async function syncConnection(ctx: Ctx, conn: BankConnectionRow) {
  const connector = await connectorFor(ctx, conn);
  const since = conn.last_sync_at ? new Date(new Date(conn.last_sync_at).getTime() - 86_400_000) : new Date(ctx.now().getTime() - 30 * 86_400_000);
  const startedAt = ctx.now().toISOString();
  const txs = await connector.listTransactions(since);
  for (const t of txs) await applyBankTransaction(ctx, conn, t);
  await ctx.store.updateBankConnection(conn.id, { last_sync_at: startedAt });
  return txs.length;
}
