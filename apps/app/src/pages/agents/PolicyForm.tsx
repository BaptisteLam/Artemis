import { useState, type FormEvent } from 'react';
import { Button, Field } from '@artemis/ui';
import { parseEurosToCents } from '@artemis/shared';
import type { PolicyRow } from '../../lib/types';
import { INTL_TAG, type Locale } from '@artemis/i18n';
import { ErrorAlert, useAction } from '../../components';
import { useI18n } from '../../i18n';

/** Montant éditable (sans symbole ni séparateur de milliers), avec le séparateur décimal de la langue. */
const euros = (cents: number, locale: Locale) =>
  new Intl.NumberFormat(INTL_TAG[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(cents / 100);
const list = (s: string) => s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

function ListInput({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint={hint}>
      <textarea className="ar-textarea" value={value} onChange={(e) => onChange(e.target.value)} rows={2} />
    </Field>
  );
}

export function PolicyForm({ policy, onSave, disabled = false }: { policy: PolicyRow; onSave: (p: Partial<PolicyRow>) => Promise<unknown>; disabled?: boolean }) {
  const { t, number, locale } = useI18n();
  const [budget, setBudget] = useState(euros(Number(policy.monthly_budget_cents), locale));
  const [perTx, setPerTx] = useState(euros(Number(policy.per_tx_limit_cents), locale));
  const [auto, setAuto] = useState(euros(Number(policy.auto_approve_below_cents), locale));
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
  const [quorumAbove, setQuorumAbove] = useState(policy.quorum_above_cents != null ? euros(Number(policy.quorum_above_cents), locale) : '');
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
    if (b === null) errs.budget = t('agents.policy.errors.budget');
    if (p === null) errs.perTx = t('agents.policy.errors.perTx');
    if (a === null) errs.auto = t('agents.policy.errors.auto');
    const ct = Number(cardTtl);
    const rt = Number(reqTtl);
    if (!Number.isInteger(ct) || ct < 5 || ct > 10080) errs.cardTtl = t('agents.policy.errors.ttl', { min: number(5), max: number(10080) });
    if (!Number.isInteger(rt) || rt < 5 || rt > 10080) errs.reqTtl = t('agents.policy.errors.ttl', { min: number(5), max: number(10080) });
    const curr = list(currencies).map((c) => c.toUpperCase());
    if (!curr.length || curr.some((c) => !/^[A-Z]{3}$/.test(c))) errs.curr = t('agents.policy.errors.currencies');
    const ph = perHour.trim() ? Number(perHour) : null;
    const rh = receiptHours.trim() ? Number(receiptHours) : null;
    if (ph !== null && (!Number.isInteger(ph) || ph < 1 || ph > 1000)) errs.perHour = t('agents.policy.errors.perHour', { min: number(1), max: number(1000) });
    if (rh !== null && (!Number.isInteger(rh) || rh < 1 || rh > 2160)) errs.receipt = t('agents.policy.errors.receipt', { min: number(1), max: number(2160) });
    const ar = Number(approvals);
    const qa = quorumAbove.trim() ? parseEurosToCents(quorumAbove) : null;
    if (quorumAbove.trim() && qa === null) errs.quorum = t('agents.policy.errors.quorum');
    const mA = list(mccAllow);
    const mD = list(mccDeny);
    if ([...mA, ...mD].some((m) => !/^\d{4}$/.test(m))) errs.mcc = t('agents.policy.errors.mcc');
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
          <Field label={t('agents.policy.monthlyBudget')} error={errors.budget} hint={t('agents.policy.monthlyBudgetHint')}>
            <input className="ar-input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
          <Field label={t('agents.policy.perTx')} error={errors.perTx}>
            <input className="ar-input" inputMode="decimal" value={perTx} onChange={(e) => setPerTx(e.target.value)} />
          </Field>
          <Field label={t('agents.policy.autoApprove')} error={errors.auto} hint={t('agents.policy.autoApproveHint')}>
            <input className="ar-input" inputMode="decimal" value={auto} onChange={(e) => setAuto(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <ListInput label={t('agents.policy.merchantAllow')} hint={t('agents.policy.merchantAllowHint')} value={allow} onChange={setAllow} />
          <ListInput label={t('agents.policy.merchantDeny')} hint={t('agents.policy.merchantDenyHint')} value={deny} onChange={setDeny} />
        </div>
        <div className="form-row">
          <Field label={t('agents.policy.mccAllow')} error={errors.mcc} hint={t('agents.policy.mccAllowHint')}>
            <input className="ar-input" value={mccAllow} onChange={(e) => setMccAllow(e.target.value)} />
          </Field>
          <Field label={t('agents.policy.mccDeny')} hint={t('agents.policy.mccDenyHint')}>
            <input className="ar-input" value={mccDeny} onChange={(e) => setMccDeny(e.target.value)} />
          </Field>
          <Field label={t('agents.policy.currencies')} error={errors.curr}>
            <input className="ar-input" value={currencies} onChange={(e) => setCurrencies(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label={t('agents.policy.cardTtl')} error={errors.cardTtl}>
            <input className="ar-input" inputMode="numeric" value={cardTtl} onChange={(e) => setCardTtl(e.target.value)} />
          </Field>
          <Field label={t('agents.policy.requestTtl')} error={errors.reqTtl}>
            <input className="ar-input" inputMode="numeric" value={reqTtl} onChange={(e) => setReqTtl(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label={t('agents.policy.perHour')} error={errors.perHour} hint={t('agents.policy.perHourHint')}>
            <input className="ar-input" inputMode="numeric" value={perHour} onChange={(e) => setPerHour(e.target.value)} />
          </Field>
          <Field label={t('agents.policy.receipt')} error={errors.receipt} hint={t('agents.policy.receiptHint')}>
            <input className="ar-input" inputMode="numeric" value={receiptHours} onChange={(e) => setReceiptHours(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label={t('agents.policy.approvals')} hint={t('agents.policy.approvalsHint')}>
            <select className="ar-select" value={approvals} onChange={(e) => setApprovals(e.target.value)}>
              {[1, 2, 3].map((n) => <option key={n} value={String(n)}>{t('agents.policy.approvers', { count: n })}</option>)}
            </select>
          </Field>
          <Field label={t('agents.policy.quorumAbove')} error={errors.quorum} hint={t('agents.policy.quorumAboveHint')}>
            <input className="ar-input" inputMode="decimal" value={quorumAbove} onChange={(e) => setQuorumAbove(e.target.value)} />
          </Field>
        </div>
        <p className="ar-small ar-muted" style={{ margin: 0 }}>{t('agents.policy.alwaysOn')}</p>
        <label className="ar-row ar-small">
          <input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} />
          {t('agents.policy.freezeOnMismatch')}
        </label>
        <ErrorAlert error={save.error} />
        <div className="ar-row">
          <Button type="submit" disabled={save.busy}>
            {save.busy ? t('agents.policy.saving') : t('agents.policy.save')}
          </Button>
          {saved && !save.error ? <span className="ar-small ar-muted" role="status">{t('agents.policy.saved')}</span> : null}
        </div>
      </fieldset>
    </form>
  );
}
