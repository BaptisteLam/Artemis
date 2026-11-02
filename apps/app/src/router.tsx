import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { AuthCallback, Login } from './auth/Login';
import { AppShell } from './layout/AppShell';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { AgentsList } from './pages/agents/AgentsList';
import { AgentNew } from './pages/agents/AgentNew';
import { AgentDetail } from './pages/agents/AgentDetail';
import { Banks } from './pages/banks/Banks';
import { RequestsList } from './pages/requests/RequestsList';
import { RequestDetail } from './pages/requests/RequestDetail';
import { Cards } from './pages/cards/Cards';
import { Transactions } from './pages/transactions/Transactions';
import { Team } from './pages/team/Team';
import { Audit } from './pages/audit/Audit';
import { Exports } from './pages/exports/Exports';
import { Settings } from './pages/settings/Settings';
import { Invitation } from './pages/Invitation';
import { Billing } from './pages/billing/Billing';
import { Admin } from './pages/admin/Admin';
import { RevealCard } from './pages/reveal/RevealCard';
import { ClientDetail, Clients } from './pages/clients/Clients';
import { Loading } from './components';

function RequireAuth() {
  const { ready, email } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="ar-container" style={{ padding: 48 }}><Loading /></div>;
  if (!email) return <Navigate to={`/connexion?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: '/connexion', element: <Login mode="login" /> },
  { path: '/inscription', element: <Login mode="signup" /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  { path: '/c/:token', element: <RevealCard /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/bienvenue', element: <Onboarding /> },
      { path: '/invitation', element: <Invitation /> },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/agents', element: <AgentsList /> },
          { path: '/agents/nouveau', element: <AgentNew /> },
          { path: '/agents/:id', element: <AgentDetail /> },
          { path: '/banques', element: <Banks /> },
          { path: '/demandes', element: <RequestsList /> },
          { path: '/demandes/:id', element: <RequestDetail /> },
          { path: '/cartes', element: <Cards /> },
          { path: '/transactions', element: <Transactions /> },
          { path: '/equipe', element: <Team /> },
          { path: '/audit', element: <Audit /> },
          { path: '/exports', element: <Exports /> },
          { path: '/reglages', element: <Settings /> },
          { path: '/facturation', element: <Billing /> },
          { path: '/admin', element: <Admin /> },
          { path: '/clients', element: <Clients /> },
          { path: '/clients/:id', element: <ClientDetail /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
