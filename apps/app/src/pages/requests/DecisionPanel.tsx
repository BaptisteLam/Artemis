import { useState } from 'react';
import { Button, Field } from '@artemis/ui';
import type { ApiClient } from '../../lib/api';
import { approveWithPasskey } from '../../lib/passkeys';
import { ErrorAlert, useAction } from '../../components';
import { useI18n } from '../../i18n';

export function DecisionPanel({ api, requestId, canDecide, onDone }: { api: ApiClient; requestId: string; canDecide: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const approve = useAction(async () => {
    await approveWithPasskey(api, requestId);
    onDone();
  });
  const reject = useAction(async () => {
    await api(`/app/requests/${requestId}/reject`, { method: 'POST', body: { reason } });
    onDone();
  });
  if (!canDecide) return <p className="ar-small ar-muted">{t('requests.decision.notAllowed')}</p>;
  const error = approve.error ?? reject.error;
  return (
    <div className="ar-stack">
      <ErrorAlert error={error && /NotAllowed|abort/i.test(error.name) ? new Error(t('requests.decision.cancelledOnDevice')) : error} />
      {rejecting ? (
        <div className="ar-stack">
          <Field label={t('requests.decision.reasonLabel')} hint={t('requests.decision.reasonHint')}>
            <input className="ar-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
          </Field>
          <div className="ar-row">
            <Button variant="danger" onClick={() => void reject.run()} disabled={reject.busy}>{t('requests.decision.confirmReject')}</Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>{t('requests.decision.cancel')}</Button>
          </div>
        </div>
      ) : (
        <div className="ar-row">
          <Button onClick={() => void approve.run()} disabled={approve.busy}>
            {approve.busy ? t('requests.decision.signing') : t('requests.decision.approve')}
          </Button>
          <Button variant="ghost" onClick={() => setRejecting(true)}>{t('requests.decision.reject')}</Button>
        </div>
      )}
    </div>
  );
}
