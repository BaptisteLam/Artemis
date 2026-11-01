import { useState } from 'react';
import { Button, Field } from '@artemis/ui';
import type { ApiClient } from '../../lib/api';
import { approveWithPasskey } from '../../lib/passkeys';
import { ErrorAlert, useAction } from '../../components';

export function DecisionPanel({ api, requestId, canDecide, onDone }: { api: ApiClient; requestId: string; canDecide: boolean; onDone: () => void }) {
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
  if (!canDecide) return <p className="ar-small ar-muted">Seuls les propriétaires, administrateurs et approbateurs peuvent décider.</p>;
  const error = approve.error ?? reject.error;
  return (
    <div className="ar-stack">
      <ErrorAlert error={error && /NotAllowed|abort/i.test(error.name) ? new Error('Validation annulée sur l’appareil.') : error} />
      {rejecting ? (
        <div className="ar-stack">
          <Field label="Motif du refus" hint="Visible par l'agent.">
            <input className="ar-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
          </Field>
          <div className="ar-row">
            <Button variant="danger" onClick={() => void reject.run()} disabled={reject.busy}>Confirmer le refus</Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Annuler</Button>
          </div>
        </div>
      ) : (
        <div className="ar-row">
          <Button onClick={() => void approve.run()} disabled={approve.busy}>
            {approve.busy ? 'Signature en cours…' : 'Approuver avec ma passkey'}
          </Button>
          <Button variant="ghost" onClick={() => setRejecting(true)}>Refuser</Button>
        </div>
      )}
    </div>
  );
}
