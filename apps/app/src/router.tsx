import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { AuthCallback, Login } from './auth/Login';
import { AppShell } from './layout/AppShell';
import { Placeholder } from './pages/Placeholder';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { AgentsList } from './pages/agents/AgentsList';
import { AgentNew } from './pages/agents/AgentNew';
import { AgentDetail } from './pages/agents/AgentDetail';
import { Banks } from './pages/banks/Banks';
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
  {
    element: <RequireAuth />,
    children: [
      { path: '/bienvenue', element: <Onboarding /> },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/agents', element: <AgentsList /> },
          { path: '/agents/nouveau', element: <AgentNew /> },
          { path: '/agents/:id', element: <AgentDetail /> },
          { path: '/banques', element: <Banks /> },
          { path: '*', element: <Placeholder title="Page" /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
