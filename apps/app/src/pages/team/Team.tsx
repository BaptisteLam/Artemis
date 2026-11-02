import { useState, type FormEvent } from 'react';
import { Button, Field } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import type { MembershipRow, Role } from '../../lib/types';
import { CopyButton, ErrorAlert, Loading, PageStage, useAction } from '../../components';
import { formatDate, ROLES, roleLabel } from '../../lib/format';
import { useI18n } from '../../i18n';

interface Invitation { id: string; email: string; role: Role; expires_at: string }

export function Team() {
  const { api, can, me } = useOrg();
  const { t } = useI18n();
  const manage = can('owner', 'admin');
  const members = useData<{ members: MembershipRow[] }>('/app/members');
  const invites = useData<{ invitations: Invitation[] }>(manage ? '/app/invitations' : null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('approver');
  const [link, setLink] = useState<string | null>(null);

  const invite = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const r = await api<{ link: string }>('/app/invitations', { method: 'POST', body: { email, role } });
    setLink(r.link);
    setEmail('');
    await invites.reload();
  });
  const changeRole = useAction(async (userId: string, next: Role) => {
    await api(`/app/members/${userId}`, { method: 'PATCH', body: { role: next } });
    await members.reload();
  });
  const removeMember = useAction(async (userId: string) => {
    if (!confirm(t('team.confirmRemove'))) return;
    await api(`/app/members/${userId}`, { method: 'DELETE' });
    await members.reload();
  });
  const revoke = useAction(async (id: string) => {
    await api(`/app/invitations/${id}`, { method: 'DELETE' });
    await invites.reload();
  });

  return (
    <>
      <PageStage title={t('team.title')} lead={t('team.lead')} />
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        <ErrorAlert error={members.error ?? invite.error ?? changeRole.error ?? removeMember.error ?? revoke.error} />
        <section className="ar-solid ar-table-wrap">
          {members.loading && !members.data ? <Loading /> : (
            <table className="ar-table">
              <thead><tr><th>{t('team.cols.member')}</th><th>{t('team.cols.role')}</th><th>{t('team.cols.since')}</th><th /></tr></thead>
              <tbody>
                {members.data?.members.map((m) => (
                  <tr key={m.user_id}>
                    <td>{m.email ?? m.user_id}{m.user_id === me?.user.id ? <span className="ar-muted ar-small"> · {t('team.you')}</span> : null}</td>
                    <td>
                      {can('owner') && m.user_id !== me?.user.id ? (
                        <select className="ar-select" style={{ minHeight: 32 }} value={m.role} onChange={(e) => void changeRole.run(m.user_id, e.target.value as Role)}>
                          {ROLES.map((v) => <option key={v} value={v}>{roleLabel(v)}</option>)}
                        </select>
                      ) : roleLabel(m.role)}
                    </td>
                    <td>{formatDate(m.created_at)}</td>
                    <td>{manage && m.user_id !== me?.user.id ? <Button variant="ghost" size="sm" onClick={() => void removeMember.run(m.user_id)}>{t('team.remove')}</Button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {manage ? (
          <section className="ar-solid ar-stack">
            <h2 className="ar-h3">{t('team.invite')}</h2>
            <form className="form-row" onSubmit={(e) => void invite.run(e)} style={{ alignItems: 'end' }}>
              <Field label={t('team.email')}><input className="ar-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
              <Field label={t('team.role')}>
                <select className="ar-select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ROLES.filter((v) => v !== 'owner' || can('owner')).map((v) => <option key={v} value={v}>{roleLabel(v)}</option>)}
                </select>
              </Field>
              <div><Button type="submit" disabled={invite.busy}>{t('team.send')}</Button></div>
            </form>
            {link ? (
              <div className="code"><CopyButton text={link} />{t('team.inviteLink')}{'\n'}{link}</div>
            ) : null}
            {invites.data?.invitations.length ? (
              <div className="list">
                {invites.data.invitations.map((i) => (
                  <div key={i.id} className="list-item">
                    <div className="grow">{i.email}<div className="sub">{roleLabel(i.role)} · {t('team.expiresOn', { date: formatDate(i.expires_at) })}</div></div>
                    <Button variant="ghost" size="sm" onClick={() => void revoke.run(i.id)}>{t('team.revoke')}</Button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </>
  );
}
