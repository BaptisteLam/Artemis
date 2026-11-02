import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button, Logo } from '@artemis/ui';
import { useAuth } from '../auth/AuthProvider';
import { useOrg } from '../lib/OrgProvider';
import { ErrorAlert, Loading } from '../components';

const LINKS = [
  { to: '/', label: 'Tableau de bord', end: true },
  { to: '/demandes', label: 'Demandes', badge: true },
  { to: '/agents', label: 'Agents' },
  { to: '/clients', label: 'Clients', hideSm: true },
  { to: '/cartes', label: 'Cartes', hideSm: true },
  { to: '/transactions', label: 'Transactions' },
  { to: '/exports', label: 'Exports', hideSm: true },
  { to: '/banques', label: 'Banques', hideSm: true },
  { to: '/equipe', label: 'Équipe', hideSm: true },
  { to: '/audit', label: 'Audit', hideSm: true },
  { to: '/facturation', label: 'Facturation', hideSm: true },
  { to: '/reglages', label: 'Réglages' },
];

export function AppShell() {
  const { email, signOut } = useAuth();
  const { me, org, orgId, setOrgId, loading, error, api, can } = useOrg();
  const navigate = useNavigate();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!org) return;
    let alive = true;
    const load = () =>
      api<{ requests: unknown[] }>('/app/requests?status=pending&limit=100')
        .then((r) => alive && setPending(r.requests.length))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [api, org]);

  useEffect(() => {
    if (!loading && me && me.organizations.length === 0) navigate('/bienvenue', { replace: true });
  }, [loading, me, navigate]);

  if (loading && !org) return <div className="ar-container" style={{ padding: 48 }}><Loading /></div>;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="ar-container topbar-inner">
          <NavLink to="/" className="brand" aria-label="Artemis, tableau de bord">
            <Logo variant="white" size={20} withWordmark />
          </NavLink>
          <span className="grow" />
          {me && me.organizations.length > 1 ? (
            <select className="org-select" aria-label="Organisation" value={orgId ?? ''} onChange={(e) => setOrgId(e.target.value)}>
              {me.organizations.map((o) => (
                <option key={o.organization.id} value={o.organization.id}>
                  {o.organization.name}
                </option>
              ))}
            </select>
          ) : org ? (
            <span className="ar-small hide-sm">{org.organization.name}</span>
          ) : null}
          {me?.user.isAdmin ? (
            <NavLink to="/admin" className="ar-btn ar-btn-glass ar-btn-sm hide-sm">
              Admin
            </NavLink>
          ) : null}
          {can('owner', 'admin') ? (
            <NavLink to="/reglages#urgence" className="ar-btn ar-btn-glass ar-btn-sm" title="Geler tous les agents et annuler les cartes actives">
              {org?.organization.frozen_at ? 'Gelé' : 'Tout geler'}
            </NavLink>
          ) : null}
          <Button variant="glass" size="sm" className="hide-sm" onClick={() => void signOut()} title={email ?? undefined}>
            Déconnexion
          </Button>
        </div>
      </header>
      <nav className="mainnav" aria-label="Navigation de l'application">
        <div className="ar-container">
          <div className="ar-nav">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={l.hideSm ? 'hide-sm' : undefined}>
                {l.label}
                {l.badge && pending > 0 ? <span className="count" aria-label={`${pending} en attente`}>{pending}</span> : null}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
      <div className="mainnav-band hide-sm" aria-hidden="true" />
      <main id="contenu">
        {error ? (
          <div className="ar-container" style={{ paddingTop: 24 }}>
            <ErrorAlert error={error} />
          </div>
        ) : null}
        {org?.organization.frozen_at ? (
          <div className="ar-container" style={{ paddingTop: 16 }}>
            <div className="alert alert-warn">Organisation gelée : aucune nouvelle carte ne peut être émise. Dégelez-la dans Réglages.</div>
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}
