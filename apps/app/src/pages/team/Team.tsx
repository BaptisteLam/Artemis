import { useState, type FormEvent } from 'react';
import { Button, Field } from '@artemis/ui';
import { useOrg } from '../../lib/OrgProvider';
import { useData } from '../../lib/useData';
import type { MembershipRow, Role } from '../../lib/types';
import { CopyButton, ErrorAlert, Loading, PageStage, useAction } from '../../components';
import { formatDate, ROLE_LABEL } from '../../lib/format';

interface Invitation { id: string; email: string; role: Role; expires_at: string }

export function Team() {
  const { api, can, me } = useOrg();
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
    if (!confirm('Retirer ce membre ?')) return;
    await api(`/app/members/${userId}`, { method: 'DELETE' });
    await members.reload();
  });
  const revoke = useAction(async (id: string) => {
    await api(`/app/invitations/${id}`, { method: 'DELETE' });
    await invites.reload();
  });

  return (
    <>
      <PageStage title="Équipe" lead="Les approbateurs reçoivent les demandes et les signent avec leur passkey." />
      <div className="ar-container page-body ar-stack" style={{ gap: 24 }}>
        <ErrorAlert error={members.error ?? invite.error ?? changeRole.error ?? removeMember.error ?? revoke.error} />
        <section className="ar-solid ar-table-wrap">
          {members.loading && !members.data ? <Loading /> : (
            <table className="ar-table">
              <thead><tr><th>Membre</th><th>Rôle</th><th>Depuis</th><th /></tr></thead>
              <tbody>
                {members.data?.members.map((m) => (
                  <tr key={m.user_id}>
                    <td>{m.email ?? m.user_id}{m.user_id === me?.user.id ? <span className="ar-muted ar-small"> · vous</span> : null}</td>
                    <td>
                      {can('owner') && m.user_id !== me?.user.id ? (
                        <select className="ar-select" style={{ minHeight: 32 }} value={m.role} onChange={(e) => void changeRole.run(m.user_id, e.target.value as Role)}>
                          {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      ) : ROLE_LABEL[m.role]}
                    </td>
                    <td>{formatDate(m.created_at)}</td>
                    <td>{manage && m.user_id !== me?.user.id ? <Button variant="ghost" size="sm" onClick={() => void removeMember.run(m.user_id)}>Retirer</Button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {manage ? (
          <section className="ar-solid ar-stack">
            <h2 className="ar-h3">Inviter</h2>
            <form className="form-row" onSubmit={(e) => void invite.run(e)} style={{ alignItems: 'end' }}>
              <Field label="Email"><input className="ar-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
              <Field label="Rôle">
                <select className="ar-select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {Object.entries(ROLE_LABEL).filter(([v]) => v !== 'owner' || can('owner')).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <div><Button type="submit" disabled={invite.busy}>Envoyer l'invitation</Button></div>
            </form>
            {link ? (
              <div className="code"><CopyButton text={link} />Lien d'invitation (valable 7 jours) :{'\n'}{link}</div>
            ) : null}
            {invites.data?.invitations.length ? (
              <div className="list">
                {invites.data.invitations.map((i) => (
                  <div key={i.id} className="list-item">
                    <div className="grow">{i.email}<div className="sub">{ROLE_LABEL[i.role]} · expire le {formatDate(i.expires_at)}</div></div>
                    <Button variant="ghost" size="sm" onClick={() => void revoke.run(i.id)}>Révoquer</Button>
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
