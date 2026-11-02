import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button, Logo } from '@artemis/ui';
import { useAuth } from '../auth/AuthProvider';
import { useOrg } from '../lib/OrgProvider';
import { ErrorAlert, Loading } from '../components';
import { useI18n } from '../i18n';
import { LangSelect } from '../i18n/LangSelect';

const LINKS = [
  { to: '/', key: 'nav.dashboard', end: true },
  { to: '/requests', key: 'nav.requests', badge: true },
  { to: '/agents', key: 'nav.agents' },
  { to: '/clients', key: 'nav.clients', hideSm: true },
  { to: '/cards', key: 'nav.cards', hideSm: true },
  { to: '/subscriptions', key: 'nav.subscriptions', hideSm: true },
  { to: '/transactions', key: 'nav.transactions' },
  { to: '/exports', key: 'nav.exports', hideSm: true },
  { to: '/banks', key: 'nav.banks', hideSm: true },
  { to: '/team', key: 'nav.team', hideSm: true },
  { to: '/audit', key: 'nav.audit', hideSm: true },
  { to: '/billing', key: 'nav.billing', hideSm: true },
  { to: '/settings', key: 'nav.settings' },
];

export function AppShell() {
  const { email, signOut } = useAuth();
  const { me, org, orgId, setOrgId, loading, error, api, can } = useOrg();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!org) return;
    let alive = true;
    const load = () =>
      api<{ requests: unknown[] }>('/app/requests?status=pending&limit=100')
        .then((r) => alive && setPending(r.requests.length))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [api, org]);

  useEffect(() => {
    if (!loading && me && me.organizations.length === 0) navigate('/welcome', { replace: true });
  }, [loading, me, navigate]);

  if (loading && !org) return <div className="ar-container" style={{ padding: 48 }}><Loading /></div>;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="ar-container topbar-inner">
          <NavLink to="/" className="brand" aria-label={t('shell.home')}>
            <Logo variant="white" size={20} withWordmark />
          </NavLink>
          <span className="grow" />
          {me && me.organizations.length > 1 ? (
            <select className="org-select" aria-label={t('shell.organization')} value={orgId ?? ''} onChange={(e) => setOrgId(e.target.value)}>
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
              {t('shell.admin')}
            </NavLink>
          ) : null}
          {can('owner', 'admin') ? (
            <NavLink to="/settings#emergency" className="ar-btn ar-btn-glass ar-btn-sm" title={t('shell.freezeAllHint')}>
              {org?.organization.frozen_at ? t('shell.frozen') : t('shell.freezeAll')}
            </NavLink>
          ) : null}
          <LangSelect className="org-select lang-select" />
          <Button variant="glass" size="sm" className="hide-sm" onClick={() => void signOut()} title={email ?? undefined}>
            {t('shell.signOut')}
          </Button>
        </div>
      </header>
      <nav className="mainnav" aria-label={t('shell.navAria')}>
        <div className="ar-container">
          <div className="ar-nav">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={l.hideSm ? 'hide-sm' : undefined}>
                {t(l.key)}
                {l.badge && pending > 0 ? <span className="count" aria-label={t('shell.pendingCount', { count: pending })}>{pending}</span> : null}
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
            <div className="alert alert-warn">{t('shell.frozenBanner')}</div>
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}
