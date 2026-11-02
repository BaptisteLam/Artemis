import { buildPushPayload } from '@block65/webcrypto-web-push';
import { formatAmount } from '@artemis/shared';
import { decryptCredentials } from '@artemis/connectors';
import type { MemberRole } from '@artemis/db';
import { safeLog } from '../http/errors';
import type { Ctx, Notifier } from './context';

type PushBuilder = (
  message: { data: string; options?: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' } },
  subscription: { endpoint: string; expirationTime: null; keys: { p256dh: string; auth: string } },
  vapid: { subject: string; publicKey: string; privateKey: string },
) => Promise<{ method: string; headers: Record<string, string> | Headers; body: BodyInit }>;

const DECIDERS: MemberRole[] = ['owner', 'admin', 'approver'];

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function emailHtml(title: string, lines: string[], cta: { label: string; href: string }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f2f1ec;font-family:Helvetica,Arial,sans-serif;color:#171818">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;border:1px solid rgba(23,24,24,.12)">
<tr><td style="background:#0000ff;color:#ffffff;padding:20px 24px;border-radius:8px 8px 0 0;font-weight:600;font-size:18px;letter-spacing:-0.03em">Artemis</td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:22px;line-height:1.2;margin:0 0 12px;font-weight:500">${esc(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 8px;font-size:15px;line-height:1.5">${esc(l)}</p>`).join('')}
<p style="margin:20px 0 0"><a href="${esc(cta.href)}" style="display:inline-block;background:#0000ff;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:4px;font-size:14px">${esc(cta.label)}</a></p>
</td></tr></table>
<p style="font-size:12px;color:#45474d;margin:16px 0 0">Vos agents paient. Vous gardez le dernier mot.</p>
</td></tr></table></body></html>`;
}

export function createNotifier(ctx: Ctx, opts: { buildPush?: PushBuilder } = {}): Notifier {
  const buildPush: PushBuilder = opts.buildPush ?? (buildPushPayload as unknown as PushBuilder);
  const { env, store } = ctx;

  async function recipients(orgId: string) {
    return (await store.listMembers(orgId)).filter((m) => DECIDERS.includes(m.role));
  }

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
      const amount = formatAmount(Number(request.amount_cents), request.currency);
      const url = `${env.APP_ORIGIN}/requests/${requestId}`;
      const who = await recipients(orgId);
      const title = `${agent?.name ?? 'Un agent'} veut dépenser ${amount}`;
      await Promise.all([
        email(
          who.map((m) => m.email).filter((e): e is string => !!e),
          `À valider : ${amount} chez ${request.merchant}`,
          emailHtml(title, [`Marchand : ${request.merchant}`, `Intention : ${request.purpose}`, 'Sans réponse, la demande expire automatiquement.'], {
            label: 'Voir et valider →',
            href: url,
          }),
        ),
        push(who.map((m) => m.user_id), { title, body: `${request.merchant} · ${request.purpose}`, url: `/requests/${requestId}`, tag: requestId }),
        slack(orgId, `*${title}* chez *${request.merchant}*\n_${request.purpose}_`, url, 'Voir et signer avec ma passkey'),
      ]);
    },
    async cardIssueFailed(orgId, requestId) {
      const request = await store.getCardRequest(requestId);
      if (!request) return;
      const who = await recipients(orgId);
      const url = `${env.APP_ORIGIN}/requests/${requestId}`;
      await email(
        who.map((m) => m.email).filter((e): e is string => !!e),
        `Échec de création de carte chez ${request.merchant}`,
        emailHtml('La banque n’a pas créé la carte', [request.decision_reason ?? 'Erreur bancaire.'], { label: 'Voir la demande →', href: url }),
      );
    },
    async transactionMismatch(orgId, transactionId) {
      const who = await recipients(orgId);
      const tx = (await store.listTransactions(orgId, { limit: 200 })).find((t) => t.id === transactionId);
      const amount = tx ? formatAmount(Number(tx.amount_cents), tx.currency) : '';
      const url = `${env.APP_ORIGIN}/transactions`;
      await Promise.all([
        email(
          who.map((m) => m.email).filter((e): e is string => !!e),
          `Écart détecté : ${amount} chez ${tx?.merchant_name ?? 'un marchand'}`,
          emailHtml('Une transaction ne correspond pas au mandat', [`${tx?.merchant_name ?? ''} · ${amount}`, 'Vérifiez la transaction et gelez l’agent si nécessaire.'], {
            label: 'Voir les transactions →',
            href: url,
          }),
        ),
        push(who.map((m) => m.user_id), { title: 'Écart sur une transaction', body: `${tx?.merchant_name ?? ''} · ${amount}`, url: '/transactions', tag: transactionId }),
      ]);
    },
    async invitation(emailAddr, orgName, link) {
      await email([emailAddr], `Invitation à rejoindre ${orgName} sur Artemis`, emailHtml(`Rejoignez ${orgName}`, ['Vous êtes invité à valider et suivre les dépenses des agents IA de votre équipe.'], { label: 'Accepter l’invitation →', href: link }));
    },
  };
}
