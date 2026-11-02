import { buildPushPayload } from '@block65/webcrypto-web-push';
import { decryptCredentials } from '@artemis/connectors';
import type { MemberRole, MembershipRow } from '@artemis/db';
import { serverT } from '../i18n';
import { safeLog } from '../http/errors';
import type { Ctx, Notifier } from './context';

type PushBuilder = (
  message: { data: string; options?: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' } },
  subscription: { endpoint: string; expirationTime: null; keys: { p256dh: string; auth: string } },
  vapid: { subject: string; publicKey: string; privateKey: string },
) => Promise<{ method: string; headers: Record<string, string> | Headers; body: BodyInit }>;

const DECIDERS: MemberRole[] = ['owner', 'admin', 'approver'];

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function emailHtml(locale: string, title: string, lines: string[], cta: { label: string; href: string }) {
  return `<!doctype html><html lang="${esc(locale)}"><body style="margin:0;background:#f2f1ec;font-family:Helvetica,Arial,sans-serif;color:#171818">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;border:1px solid rgba(23,24,24,.12)">
<tr><td style="background:#0000ff;color:#ffffff;padding:20px 24px;border-radius:8px 8px 0 0;font-weight:600;font-size:18px;letter-spacing:-0.03em">Artemis</td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:22px;line-height:1.2;margin:0 0 12px;font-weight:500">${esc(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 8px;font-size:15px;line-height:1.5">${esc(l)}</p>`).join('')}
<p style="margin:20px 0 0"><a href="${esc(cta.href)}" style="display:inline-block;background:#0000ff;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:4px;font-size:14px">${esc(cta.label)}</a></p>
</td></tr></table>
<p style="font-size:12px;color:#45474d;margin:16px 0 0">${esc(serverT(locale).t('notify.tagline'))}</p>
</td></tr></table></body></html>`;
}

export function createNotifier(ctx: Ctx, opts: { buildPush?: PushBuilder } = {}): Notifier {
  const buildPush: PushBuilder = opts.buildPush ?? (buildPushPayload as unknown as PushBuilder);
  const { env, store } = ctx;

  async function recipients(orgId: string) {
    return (await store.listMembers(orgId)).filter((m) => DECIDERS.includes(m.role));
  }

  /** Regroupe les destinataires par langue : chacun reçoit les messages dans la sienne. */
  function byLocale(members: MembershipRow[]) {
    const groups = new Map<string, MembershipRow[]>();
    for (const m of members) {
      const l = serverT(m.locale).locale;
      groups.set(l, [...(groups.get(l) ?? []), m]);
    }
    return [...groups.entries()].map(([locale, list]) => ({ ...serverT(locale), emails: list.map((m) => m.email).filter((e): e is string => !!e), userIds: list.map((m) => m.user_id) }));
  }

  /** Langue des messages d'organisation (Slack) : celle du premier propriétaire. */
  const orgLocale = (members: MembershipRow[]) => serverT((members.find((m) => m.role === 'owner') ?? members[0])?.locale);

  async function email(to: string[], subject: string, html: string) {
    if (!env.RESEND_API_KEY || !to.length) return;
    const res = await ctx.fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
    });
    if (!res.ok) safeLog('resend', new Error(`status ${res.status}`));
  }

  async function push(userIds: string[], payload: { title: string; body: string; url: string; tag: string }) {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
    const subs = await store.listPushSubscriptions(userIds);
    await Promise.all(
      subs.map(async (s) => {
        try {
          const req = await buildPush(
            { data: JSON.stringify(payload), options: { ttl: 1800, urgency: 'high' } },
            { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } },
            { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! },
          );
          const res = await ctx.fetch(s.endpoint, req as RequestInit);
          if (res.status === 404 || res.status === 410) await store.deletePushSubscription(s.endpoint);
        } catch (e) {
          safeLog('push', e);
        }
      }),
    );
  }

  async function slack(orgId: string, text: string, url: string, label: string) {
    const org = await store.getOrganization(orgId);
    if (!org?.slack_webhook_ciphertext) return;
    try {
      const { url: hook } = await decryptCredentials<{ url: string }>(org.slack_webhook_ciphertext, env.CONNECTIONS_KEY);
      if (!/^https:\/\/hooks\.slack\.com\//.test(hook)) return;
      await ctx.fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text } },
            { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: label }, url, style: 'primary' }] },
          ],
        }),
      });
    } catch (e) {
      safeLog('slack', e);
    }
  }

  return {
    async requestPending(orgId, requestId) {
      const request = await store.getCardRequest(requestId);
      if (!request) return;
      const agent = await store.getAgent(request.agent_id);
      const url = `${env.APP_ORIGIN}/requests/${requestId}`;
      const who = await recipients(orgId);
      const titleIn = (g: ReturnType<typeof serverT>) =>
        g.t('notify.requestPending.title', { agent: agent?.name ?? g.t('notify.unknownAgent'), amount: g.money(Number(request.amount_cents), request.currency) });
      const slackT = orgLocale(who);
      await Promise.all([
        ...byLocale(who).flatMap((g) => {
          const amount = g.money(Number(request.amount_cents), request.currency);
          const title = titleIn(g);
          return [
            email(
              g.emails,
              g.t('notify.requestPending.subject', { amount, merchant: request.merchant }),
              emailHtml(g.locale, title, [g.t('notify.requestPending.merchant', { merchant: request.merchant }), g.t('notify.requestPending.purpose', { purpose: request.purpose }), g.t('notify.requestPending.expires')], {
                label: g.t('notify.requestPending.cta'),
                href: url,
              }),
            ),
            push(g.userIds, { title, body: `${request.merchant} · ${request.purpose}`, url: `/requests/${requestId}`, tag: requestId }),
          ];
        }),
        slack(orgId, `${slackT.t('notify.requestPending.slack', { title: titleIn(slackT), merchant: request.merchant })}\n_${request.purpose}_`, url, slackT.t('notify.requestPending.slackCta')),
      ]);
    },
    async cardIssueFailed(orgId, requestId) {
      const request = await store.getCardRequest(requestId);
      if (!request) return;
      const url = `${env.APP_ORIGIN}/requests/${requestId}`;
      await Promise.all(
        byLocale(await recipients(orgId)).map((g) =>
          email(
            g.emails,
            g.t('notify.cardIssueFailed.subject', { merchant: request.merchant }),
            emailHtml(g.locale, g.t('notify.cardIssueFailed.title'), [request.decision_reason ?? g.t('notify.cardIssueFailed.fallback')], { label: g.t('notify.cardIssueFailed.cta'), href: url }),
          ),
        ),
      );
    },
    async transactionMismatch(orgId, transactionId) {
      const who = await recipients(orgId);
      const tx = (await store.listTransactions(orgId, { limit: 200 })).find((t) => t.id === transactionId);
      const url = `${env.APP_ORIGIN}/transactions`;
      await Promise.all(
        byLocale(who).flatMap((g) => {
          const amount = tx ? g.money(Number(tx.amount_cents), tx.currency) : '';
          const merchant = tx?.merchant_name ?? g.t('notify.unknownMerchant');
          return [
            email(
              g.emails,
              g.t('notify.mismatch.subject', { amount, merchant }),
              emailHtml(g.locale, g.t('notify.mismatch.title'), [`${tx?.merchant_name ?? ''} · ${amount}`, g.t('notify.mismatch.check')], { label: g.t('notify.mismatch.cta'), href: url }),
            ),
            push(g.userIds, { title: g.t('notify.mismatch.pushTitle'), body: `${tx?.merchant_name ?? ''} · ${amount}`, url: '/transactions', tag: transactionId }),
          ];
        }),
      );
    },
    async invitation(emailAddr, orgName, link, locale) {
      const g = serverT(locale);
      await email(
        [emailAddr],
        g.t('notify.invitation.subject', { org: orgName }),
        emailHtml(g.locale, g.t('notify.invitation.title', { org: orgName }), [g.t('notify.invitation.body')], { label: g.t('notify.invitation.cta'), href: `${link}&lang=${g.locale}` }),
      );
    },
  };
}
