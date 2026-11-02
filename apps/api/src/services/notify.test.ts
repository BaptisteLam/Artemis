import { describe, expect, it } from 'vitest';
import { createNotifier } from './notify';
import { createCardRequest } from './requests';
import { setupWorld } from './testing';

function recorder(pushStatus = 201) {
  const calls: { url: string; body: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    if (String(url).startsWith('https://push.example')) return new Response('', { status: pushStatus });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, f };
}

const fakePush = async () => ({ method: 'POST', headers: {}, body: 'encrypted' });

describe('notifier', () => {
  it('emails approvers only, with a link to the request', async () => {
    const w = await setupWorld();
    const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant: 'Notion', purpose: 'abonnement' });
    const { calls, f } = recorder();
    const n = createNotifier({ ...w.ctx, fetch: f, env: { ...w.ctx.env, RESEND_API_KEY: 're_test' } }, { buildPush: fakePush });
    await n.requestPending(w.org.id, r.requestId);
    const emails = calls.filter((c) => c.url === 'https://api.resend.com/emails').map((c) => JSON.parse(c.body));
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toEqual(['owner@exemple.fr']);
    expect(emails[0].html).toContain(`http://localhost:5173/requests/${r.requestId}`);
    expect(emails[0].subject).toContain('€49.00');
  });
  it('writes to each recipient in their own language', async () => {
    const w = await setupWorld();
    await w.store.setUserLocale(w.owner.id, 'fr');
    const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant: 'Notion', purpose: 'abonnement' });
    const { calls, f } = recorder();
    await createNotifier({ ...w.ctx, fetch: f, env: { ...w.ctx.env, RESEND_API_KEY: 're_test' } }, { buildPush: fakePush }).requestPending(w.org.id, r.requestId);
    const mail = JSON.parse(calls.find((c) => c.url === 'https://api.resend.com/emails')!.body);
    expect(mail.subject.replace(/\s/g, ' ')).toBe('À valider : 49,00 € chez Notion');
    expect(mail.html).toContain('<html lang="fr">');
    expect(mail.html).toContain('Vous gardez le dernier mot');
  });
  it('sends no email without a Resend key', async () => {
    const w = await setupWorld();
    const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant: 'Notion', purpose: 'x' });
    const { calls, f } = recorder();
    await createNotifier({ ...w.ctx, fetch: f }, { buildPush: fakePush }).requestPending(w.org.id, r.requestId);
    expect(calls.filter((c) => c.url.includes('resend'))).toHaveLength(0);
  });
  it('deletes expired push subscriptions (410)', async () => {
    const w = await setupWorld();
    await w.store.savePushSubscription({ user_id: w.owner.id, endpoint: 'https://push.example/abc', p256dh: 'k', auth: 'a' });
    const r = await createCardRequest(w.ctx, w.agent, { amount: 4900, merchant: 'Notion', purpose: 'x' });
    const { calls, f } = recorder(410);
    const env = { ...w.ctx.env, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };
    await createNotifier({ ...w.ctx, fetch: f, env }, { buildPush: fakePush }).requestPending(w.org.id, r.requestId);
    expect(calls.some((c) => c.url === 'https://push.example/abc')).toBe(true);
    expect(await w.store.listPushSubscriptions([w.owner.id])).toHaveLength(0);
  });
});
