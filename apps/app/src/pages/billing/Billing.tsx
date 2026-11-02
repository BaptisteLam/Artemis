import { useSearchParams } from 'react-router-dom';
import { Button } from '@artemis/ui';
import { OVERAGE_CENTS, PLAN_LIMITS, PLANS, type Plan } from '@artemis/shared';
import { formatMoney } from '@artemis/i18n';
import { useOrg } from '../../lib/OrgProvider';
import { ErrorAlert, PageStage, useAction } from '../../components';
import { useI18n } from '../../i18n';

/** Arguments de chaque plan : clés `billing.pitch.<plan>.<n>`. */
const PITCH: Record<Plan, number> = { sandbox: 3, builder: 4, team: 5, agency: 4, business: 4 };

export function Billing() {
  const { api, org, can } = useOrg();
  const { t, locale, money, number } = useI18n();
  const [params] = useSearchParams();
  const owner = can('owner');
  const current = org?.effective_plan ?? 'sandbox';
  const checkout = useAction(async (plan: Plan) => {
    window.location.href = (await api<{ url: string }>('/app/billing/checkout', { method: 'POST', body: { plan } })).url;
  });
  const portal = useAction(async () => {
    window.location.href = (await api<{ url: string }>('/app/billing/portal', { method: 'POST' })).url;
  });
  const status = params.get('status');
  const limit = org?.limits.requestsPerMonth;
  const used = org?.usage.requests ?? 0;
  const whole = (eur: number) => formatMoney(locale, eur * 100, 'EUR', { whole: true });
  const name = (p: Plan) => t(`billing.plans.${p}`);
  return (
    <>
      <PageStage
        title={t('billing.title')}
        lead={t('billing.lead', { plan: name(current), usage: limit ? t('billing.usageOf', { used: number(used), limit: number(limit) }) : number(used) })}
        actions={owner && org?.organization.stripe_customer_id ? <Button variant="glass" onClick={() => void portal.run()}>{t('billing.manage')}</Button> : null}
      />
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        {status === 'ok' ? <div className="alert alert-info">{t('billing.returnOk')}</div> : null}
        {status === 'canceled' ? <div className="alert alert-warn">{t('billing.returnCanceled')}</div> : null}
        {org && org.organization.plan !== 'sandbox' && current === 'sandbox' ? (
          <div className="alert alert-error">{t('billing.inactive', { status: org.organization.subscription_status ?? t('billing.unknown') })}</div>
        ) : null}
        <ErrorAlert error={checkout.error ?? portal.error} />
        <p className="ar-small ar-muted" style={{ margin: 0 }}>{t('billing.overage', { price: money(OVERAGE_CENTS) })} {t('billing.overageCount', { count: used })}</p>
        {!owner ? <p className="ar-muted">{t('billing.ownerOnly')}</p> : null}
        <div className="stat-grid" style={{ marginTop: 0 }}>
          {PLANS.map((p) => (
            <div key={p} className="ar-solid ar-stack" style={p === current ? { borderColor: 'var(--ar-cobalt)', boxShadow: 'var(--ar-shadow-offset)' } : undefined}>
              <div className="ar-spread"><h2 className="ar-h3">{name(p)}</h2>{p === current ? <span className="ar-badge ar-badge-info"><span className="ar-badge-dot" />{t('billing.current')}</span> : null}</div>
              <div><span className="ar-amount ar-amount-md">{p === 'business' ? t('billing.from', { price: whole(PLAN_LIMITS[p].priceEur) }) : whole(PLAN_LIMITS[p].priceEur)}</span> <span className="ar-small ar-muted">{t('billing.perMonth')}</span></div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                {Array.from({ length: PITCH[p] }, (_, i) => <li key={i}>{t(`billing.pitch.${p}.i${i + 1}`, { price: whole(PLAN_LIMITS[p].perClientEur) })}</li>)}
              </ul>
              {owner && p !== 'sandbox' && p !== current ? (
                <Button variant={p === 'agency' ? 'primary' : 'ghost'} onClick={() => (org?.organization.stripe_customer_id ? void portal.run() : void checkout.run(p))} disabled={checkout.busy || portal.busy}>
                  {t('billing.choose', { plan: name(p) })}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
