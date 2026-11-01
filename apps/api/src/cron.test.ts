import { describe, expect, it } from 'vitest';
import { decryptCredentials, SandboxConnector, type SandboxState } from '@artemis/connectors';
import { runScheduled } from './cron';
import { approveRequest, createCardRequest } from './services/requests';
import { fakeVerifier, setupWorld } from './services/testing';

async function issued(w: Awaited<ReturnType<typeof setupWorld>>, merchant = 'Notion') {
  const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant, purpose: 'x' });
  await approveRequest(w.ctx, w.owner, w.org.id, r.requestId, fakeVerifier);
  return r.requestId;
}

async function pay(w: Awaited<ReturnType<typeof setupWorld>>, requestId: string, amountCents: number, merchantName: string) {
  const conn = (await w.store.getBankConnection(w.conn.id))!;
  const state = await decryptCredentials<SandboxState>(conn.credentials_ciphertext, w.ctx.env.CONNECTIONS_KEY);
  const card = (await w.store.getCardByRequest(requestId))!;
  const sbx = new SandboxConnector(state, { now: w.ctx.now, onCredentialsUpdate: async (s) => {
    const { encryptCredentials } = await import('@artemis/connectors');
    await w.store.updateBankConnection(w.conn.id, { credentials_ciphertext: await encryptCredentials(s, w.ctx.env.CONNECTIONS_KEY) });
  } });
  return sbx.simulatePayment(card.provider_card_id, { amountCents, merchantName });
}

describe('scheduled job', () => {
  it('expires pending requests', async () => {
    const w = await setupWorld();
    const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant: 'Notion', purpose: 'x' });
    w.advance(31 * 60_000);
    await runScheduled(w.ctx);
    expect((await w.store.getCardRequest(r.requestId))?.status).toBe('expired');
  });
  it('cancels expired unused cards', async () => {
    const w = await setupWorld();
    const id = await issued(w);
    w.advance(31 * 60_000);
    await runScheduled(w.ctx);
    expect((await w.store.getCardByRequest(id))?.status).toBe('expired');
  });
  it('syncs and matches a sandbox payment', async () => {
    const w = await setupWorld();
    const id = await issued(w);
    await pay(w, id, 4900, 'Notion Labs');
    await runScheduled(w.ctx);
    const txs = await w.store.listTransactions(w.org.id);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.match_status).toBe('matched');
    expect((await w.store.getCardRequest(id))?.status).toBe('completed');
    expect((await w.store.getCardByRequest(id))?.status).toBe('used');
  });
  it('flags a mismatch, notifies and can freeze the agent', async () => {
    const w = await setupWorld({ policy: { freeze_on_mismatch: true } });
    const id = await issued(w);
    await pay(w, id, 4900, 'Amazon');
    await runScheduled(w.ctx);
    await w.flush();
    const tx = (await w.store.listTransactions(w.org.id))[0]!;
    expect(tx.match_status).toBe('mismatch');
    expect(w.calls).toContain(`mismatch:${tx.id}`);
    expect((await w.store.getAgent(w.agent.id))?.status).toBe('frozen');
  });
  it('a failing connection does not stop the others', async () => {
    const w = await setupWorld();
    await w.store.createBankConnection({ org_id: w.org.id, provider: 'sandbox', label: 'cassée', credentials_ciphertext: 'v1.x.y' });
    const id = await issued(w);
    await pay(w, id, 4900, 'Notion');
    await runScheduled(w.ctx);
    expect((await w.store.listTransactions(w.org.id))).toHaveLength(1);
  });
});
