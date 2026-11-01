import { describe, expect, it } from 'vitest';
import { SandboxConnector, newSandboxState, type SandboxState } from './sandbox';

function make(now = new Date('2026-11-01T10:00:00Z')) {
  let saved: SandboxState | null = null;
  const state = newSandboxState();
  const c = new SandboxConnector(state, { now: () => now, onCredentialsUpdate: async (s) => void (saved = s as SandboxState) });
  return { c, state, saved: () => saved };
}

const input = (o = {}) => ({
  amountCents: 4900,
  currency: 'EUR',
  merchant: 'Notion',
  expiresAt: new Date('2026-11-01T10:30:00Z'),
  label: 'notion.agent',
  idempotencyKey: 'req-1',
  ...o,
});

function luhnOk(n: string) {
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

describe('SandboxConnector', () => {
  it('creates an active card whose last4 matches the revealed number', async () => {
    const { c, saved } = make();
    const card = await c.createSingleUseCard(input());
    expect(card.status).toBe('active');
    const d = await c.revealCard(card.providerCardId);
    expect(d.number).toMatch(/^4242\d{12}$/);
    expect(luhnOk(d.number)).toBe(true);
    expect(d.number.slice(-4)).toBe(card.last4);
    expect(d.cvc).toMatch(/^\d{3}$/);
    expect(saved()).not.toBeNull();
    expect(JSON.stringify(saved())).not.toContain(d.number);
  });
  it('is idempotent on idempotencyKey', async () => {
    const { c } = make();
    const a = await c.createSingleUseCard(input());
    const b = await c.createSingleUseCard(input());
    expect(b.providerCardId).toBe(a.providerCardId);
  });
  it('declines a payment above the limit and only allows one use', async () => {
    const { c } = make();
    const card = await c.createSingleUseCard(input());
    expect((await c.simulatePayment(card.providerCardId, { amountCents: 5000, merchantName: 'Notion' })).status).toBe('declined');
    expect((await c.simulatePayment(card.providerCardId, { amountCents: 4900, merchantName: 'Notion Labs' })).status).toBe('posted');
    expect((await c.simulatePayment(card.providerCardId, { amountCents: 100, merchantName: 'Notion' })).status).toBe('declined');
  });
  it('declines a canceled card', async () => {
    const { c } = make();
    const card = await c.createSingleUseCard(input());
    await c.cancelCard(card.providerCardId);
    expect((await c.simulatePayment(card.providerCardId, { amountCents: 100, merchantName: 'Notion' })).status).toBe('declined');
  });
  it('lists transactions since a date', async () => {
    const { c } = make();
    const card = await c.createSingleUseCard(input());
    await c.simulatePayment(card.providerCardId, { amountCents: 4900, merchantName: 'Notion' });
    expect(await c.listTransactions(new Date('2026-11-01T09:00:00Z'))).toHaveLength(1);
    expect(await c.listTransactions(new Date('2026-11-01T11:00:00Z'))).toHaveLength(0);
  });
  it('tests connection', async () => expect((await make().c.testConnection()).ok).toBe(true));
});
