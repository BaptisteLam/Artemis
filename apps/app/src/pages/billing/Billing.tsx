import { useSearchParams } from 'react-router-dom';
import { Button } from '@artemis/ui';
import { PLAN_LIMITS, PLANS, type Plan } from '@artemis/shared';
import { useOrg } from '../../lib/OrgProvider';
import { ErrorAlert, PageStage, useAction } from '../../components';

const PITCH: Record<Plan, string[]> = {
  sandbox: ['1 agent', 'Banque simulée', '20 mandats simulés / mois'],
  builder: ['3 agents', '1 banque réelle', '50 mandats / mois', 'Validation par passkey et notifications'],
  team: ['10 agents', '2 banques réelles', '300 mandats / mois', 'Slack, quorum d’approbateurs, export FEC', 'Abonnements gérés par agent'],
  agency: ['25 agents, clients illimités', '1 000 mandats / mois', 'Budgets, marge et refacturation par client', '+ 15 € par client actif'],
  business: ['Illimité', 'Dossier et rapport AI Act', 'Export signé du journal', 'Accompagnement prioritaire'],
};
const NAME: Record<Plan, string> = { sandbox: 'Sandbox', builder: 'Builder', team: 'Team', agency: 'Agences', business: 'Business' };

export function Billing() {
  const { api, org, can } = useOrg();
  const [params] = useSearchParams();
  const owner = can('owner');
  const current = org?.effective_plan ?? 'sandbox';
  const checkout = useAction(async (plan: Plan) => {
    window.location.href = (await api<{ url: string }>('/app/billing/checkout', { method: 'POST', body: { plan } })).url;
  });
  const portal = useAction(async () => {
    window.location.href = (await api<{ url: string }>('/app/billing/portal', { method: 'POST' })).url;
  });
  const status = params.get('statut');
  const limit = org?.limits.requestsPerMonth;
  return (
    <>
      <PageStage
        title="Facturation"
        lead={`Plan actuel : ${NAME[current]}. Demandes ce mois : ${org?.usage.requests ?? 0}${limit ? ` / ${limit}` : ''}. TVA non applicable, art. 293 B du CGI.`}
        actions={owner && org?.organization.stripe_customer_id ? <Button variant="glass" onClick={() => void portal.run()}>Gérer l'abonnement et les factures</Button> : null}
      />
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        {status === 'ok' ? <div className="alert alert-info">Merci ! Votre abonnement est en cours d'activation (quelques secondes).</div> : null}
        {status === 'annule' ? <div className="alert alert-warn">Paiement annulé, aucun changement.</div> : null}
        {org && org.organization.plan !== 'sandbox' && current === 'sandbox' ? (
          <div className="alert alert-error">Votre abonnement n'est plus actif ({org.organization.subscription_status ?? 'inconnu'}). Les fonctions payantes sont suspendues : mettez à jour votre moyen de paiement.</div>
        ) : null}
        <ErrorAlert error={checkout.error ?? portal.error} />
        <p className="ar-small ar-muted" style={{ margin: 0 }}>Au-delà du quota d'un plan payant, chaque mandat supplémentaire est facturé 0,25 €. Ce mois-ci : {org?.usage.requests ?? 0} mandat(s).</p>
        {!owner ? <p className="ar-muted">Seul un propriétaire peut modifier l'abonnement.</p> : null}
        <div className="stat-grid" style={{ marginTop: 0 }}>
          {PLANS.map((p) => (
            <div key={p} className="ar-solid ar-stack" style={p === current ? { borderColor: 'var(--ar-cobalt)', boxShadow: 'var(--ar-shadow-offset)' } : undefined}>
              <div className="ar-spread"><h2 className="ar-h3">{NAME[p]}</h2>{p === current ? <span className="ar-badge ar-badge-info"><span className="ar-badge-dot" />Actuel</span> : null}</div>
              <div><span className="ar-amount ar-amount-md">{p === 'business' ? 'dès ' : ''}{PLAN_LIMITS[p].priceEur} €</span> <span className="ar-small ar-muted">/ mois</span></div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>{PITCH[p].map((x) => <li key={x}>{x}</li>)}</ul>
              {owner && p !== 'sandbox' && p !== current ? (
                <Button variant={p === 'agency' ? 'primary' : 'ghost'} onClick={() => (org?.organization.stripe_customer_id ? void portal.run() : void checkout.run(p))} disabled={checkout.busy || portal.busy}>
                  Choisir {NAME[p]}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
