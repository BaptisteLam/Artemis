import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import '@artemis/ui/tokens.css';
import '@artemis/ui/base.css';
import './app.css';
import { AuthProvider } from './auth/AuthProvider';
import { OrgProvider } from './lib/OrgProvider';
import { router } from './router';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <OrgProvider>
        <RouterProvider router={router} />
      </OrgProvider>
    </AuthProvider>
  </StrictMode>,
);
