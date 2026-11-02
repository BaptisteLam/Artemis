import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Glass, Stage } from '@artemis/ui';
import { useOrg } from '../lib/OrgProvider';
import { ErrorAlert, Loading, useAction } from '../components';
import { useI18n } from '../i18n';

export function Invitation() {
  const [params] = useSearchParams();
  const { api, setOrgId, refresh } = useOrg();
  const navigate = useNavigate();
  const { t } = useI18n();
  const started = useRef(false);
  const accept = useAction(async () => {
    const r = await api<{ organization: { id: string } }>('/app/invitations/accept', { method: 'POST', body: { token: params.get('token') } });
    setOrgId(r.organization.id);
    await refresh();
    navigate('/settings', { replace: true });
  });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void accept.run();
  }, [accept]);
  return (
    <Stage className="login-wrap">
      <Glass tone="frost" style={{ width: 'min(420px, 100%)' }}>
        <h1 className="ar-h3">{t('invitation.title')}</h1>
        {accept.error ? <ErrorAlert error={accept.error} /> : <Loading label={t('invitation.accepting')} />}
      </Glass>
    </Stage>
  );
}
