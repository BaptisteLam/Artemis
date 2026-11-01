import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { AuthCallback, Login } from './auth/Login';
import { AppShell } from './layout/AppShell';
import { Placeholder } from './pages/Placeholder';
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
      {
        element: <AppShell />,
        children: [{ path: '/', element: <Placeholder title="Tableau de bord" /> }],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
