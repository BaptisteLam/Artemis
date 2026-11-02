import { useState, type FormEvent } from 'react';
import { Button, Field } from '@artemis/ui';
import { parseEurosToCents } from '@artemis/shared';
import type { PolicyRow } from '../../lib/types';
import { ErrorAlert, useAction } from '../../components';

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const list = (s: string) => s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

function ListInput({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint={hint}>
      <textarea className="ar-textarea" value={value} onChange={(e) => onChange(e.target.value)} rows={2} />
    </Field>
  );
}

export function PolicyForm({ policy, onSave, disabled = false }: { policy: PolicyRow; onSave: (p: Partial<PolicyRow>) => Promise<unknown>; disabled?: boolean }) {
  const [budget, setBudget] = useState(euros(Number(policy.monthly_budget_cents)));
  const [perTx, setPerTx] = useState(euros(Number(policy.per_tx_limit_cents)));
  const [auto, setAuto] = useState(euros(Number(policy.auto_approve_below_cents)));
  const [allow, setAllow] = useState(policy.merchant_allow.join(', '));
  const [deny, setDeny] = useState(policy.merchant_deny.join(', '));
  const [mccAllow, setMccAllow] = useState(policy.mcc_allow.join(', '));
  const [mccDeny, setMccDeny] = useState(policy.mcc_deny.join(', '));
  const [currencies, setCurrencies] = useState(policy.currencies.join(', '));
  const [cardTtl, setCardTtl] = useState(String(policy.card_ttl_minutes));
  const [reqTtl, setReqTtl] = useState(String(policy.request_ttl_minutes));
  const [freeze, setFreeze] = useState(policy.freeze_on_mismatch);
  const [perHour, setPerHour] = useState(policy.max_requests_per_hour ? String(policy.max_requests_per_hour) : '');
  const [approvals, setApprovals] = useState(String(policy.approvals_required ?? 1));
  const [quorumAbove, setQuorumAbove] = useState(policy.quorum_above_cents != null ? euros(Number(policy.quorum_above_cents)) : '');
  const [receiptHours, setReceiptHours] = useState(policy.require_receipt_hours ? String(policy.require_receipt_hours) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const save = useAction(onSave);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const errs: Record<string, string> = {};
    const b = parseEurosToCents(budget);
    const p = parseEurosToCents(perTx);
    const a = parseEurosToCents(auto);
    if (b === null) errs.budget = 'Montant invalide (ex. 500 ou 49,90).';
    if (p === null) errs.perTx = 'Montant invalide (ex. 100 ou 49,90).';
    if (a === null) errs.auto = 'Montant invalide (0 pour désactiver).';
    const ct = Number(cardTtl);
    const rt = Number(reqTtl);
    if (!Number.isInteger(ct) || ct < 5 || ct > 10080) errs.cardTtl = 'Entre 5 et 10 080 minutes.';
    if (!Number.isInteger(rt) || rt < 5 || rt > 10080) errs.reqTtl = 'Entre 5 et 10 080 minutes.';
    const curr = list(currencies).map((c) => c.toUpperCase());
    if (!curr.length || curr.some((c) => !/^[A-Z]{3}$/.test(c))) errs.curr = 'Codes ISO à 3 lettres, ex. EUR, USD.';
    const ph = perHour.trim() ? Number(perHour) : null;
    const rh = receiptHours.trim() ? Number(receiptHours) : null;
    if (ph !== null && (!Number.isInteger(ph) || ph < 1 || ph > 1000)) errs.perHour = 'Entre 1 et 1 000, ou vide.';
    if (rh !== null && (!Number.isInteger(rh) || rh < 1 || rh > 2160)) errs.receipt = 'Entre 1 et 2 160 heures, ou vide.';
    const ar = Number(approvals);
    const qa = quorumAbove.trim() ? parseEurosToCents(quorumAbove) : null;
    if (quorumAbove.trim() && qa === null) errs.quorum = 'Montant invalide.';
    const mA = list(mccAllow);
    const mD = list(mccDeny);
    if ([...mA, ...mD].some((m) => !/^\d{4}$/.test(m))) errs.mcc = 'Codes MCC à 4 chiffres.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await save.run({
      monthly_budget_cents: b!,
      per_tx_limit_cents: p!,
      auto_approve_below_cents: a!,
      merchant_allow: list(allow),
      merchant_deny: list(deny),
      mcc_allow: mA,
      mcc_deny: mD,
      currencies: curr,
      card_ttl_minutes: ct,
      request_ttl_minutes: rt,
      freeze_on_mismatch: freeze,
      max_requests_per_hour: ph,
      require_receipt_hours: rh,
      approvals_required: ar,
      quorum_above_cents: qa,
    });
    if (ok !== undefined || !save.error) setSaved(true);
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 16 }}>
        <div className="form-row">
          <Field label="Budget mensuel (€)" error={errors.budget} hint="Cumul des demandes du mois (heure de Paris).">
            <input className="ar-input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
          <Field label="Plafond par achat (€)" error={errors.perTx}>
            <input className="ar-input" inputMode="decimal" value={perTx} onChange={(e) => setPerTx(e.target.value)} />
          </Field>
          <Field label="Auto-validation sous (€)" error={errors.auto} hint="Seulement pour les marchands autorisés. 0 = toujours valider.">
            <input className="ar-input" inputMode="decimal" value={auto} onChange={(e) => setAuto(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <ListInput label="Marchands autorisés" hint="Séparés par des virgules. Vide = tous, sauf interdits." value={allow} onChange={setAllow} />
          <ListInput label="Marchands interdits" hint="Ex. Amazon, Casino" value={deny} onChange={setDeny} />
        </div>
        <div className="form-row">
          <Field label="Catégories MCC autorisées" error={errors.mcc} hint="Optionnel, ex. 5734, 7372">
            <input className="ar-input" value={mccAllow} onChange={(e) => setMccAllow(e.target.value)} />
          </Field>
          <Field label="Catégories MCC interdites" hint="Ex. 7995 (jeux d'argent)">
            <input className="ar-input" value={mccDeny} onChange={(e) => setMccDeny(e.target.value)} />
          </Field>
          <Field label="Devises" error={errors.curr}>
            <input className="ar-input" value={currencies} onChange={(e) => setCurrencies(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Durée de vie d'une carte (min)" error={errors.cardTtl}>
            <input className="ar-input" inputMode="numeric" value={cardTtl} onChange={(e) => setCardTtl(e.target.value)} />
          </Field>
          <Field label="Expiration d'une demande (min)" error={errors.reqTtl}>
            <input className="ar-input" inputMode="numeric" value={reqTtl} onChange={(e) => setReqTtl(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Demandes max. par heure" error={errors.perHour} hint="Vide = illimité. Freine un agent emballé ou manipulé.">
            <input className="ar-input" inputMode="numeric" value={perHour} onChange={(e) => setPerHour(e.target.value)} />
          </Field>
          <Field label="Justificatif exigé sous (heures)" error={errors.receipt} hint="Vide = désactivé. Passé ce délai, l'agent est gelé.">
            <input className="ar-input" inputMode="numeric" value={receiptHours} onChange={(e) => setReceiptHours(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Signatures requises" hint="Quorum d'approbateurs distincts (plans Team et plus).">
            <select className="ar-select" value={approvals} onChange={(e) => setApprovals(e.target.value)}>
              <option value="1">1 approbateur</option>
              <option value="2">2 approbateurs</option>
              <option value="3">3 approbateurs</option>
            </select>
          </Field>
          <Field label="Quorum à partir de (€)" error={errors.quorum} hint="Vide = pour toutes les demandes.">
            <input className="ar-input" inputMode="decimal" value={quorumAbove} onChange={(e) => setQuorumAbove(e.target.value)} />
          </Field>
        </div>
        <p className="ar-small ar-muted" style={{ margin: 0 }}>Toujours actifs : catégories à risque bloquées (jeux, transferts, quasi-espèces, titres) et validation humaine forcée sur un montant inhabituel (plus de 3 fois la médiane de l'agent).</p>
        <label className="ar-row ar-small">
          <input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} />
          Geler l'agent automatiquement en cas d'écart de montant ou de marchand
        </label>
        <ErrorAlert error={save.error} />
        <div className="ar-row">
          <Button type="submit" disabled={save.busy}>
            {save.busy ? 'Enregistrement…' : 'Enregistrer les règles'}
          </Button>
          {saved && !save.error ? <span className="ar-small ar-muted" role="status">Règles enregistrées.</span> : null}
        </div>
      </fieldset>
    </form>
  );
}
