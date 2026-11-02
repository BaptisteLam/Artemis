import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AUTH_MODE } from '../lib/config';
import { local } from '../lib/storage';
import { supabase } from './supabase';

interface AuthState {
  ready: boolean;
  email: string | null;
  getAuthHeader: () => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<void>;
  devSignIn: (email: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const DEV_KEY = 'artemis.dev-email';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (AUTH_MODE === 'dev') {
      setEmail(local.get(DEV_KEY));
      setReady(true);
      return;
    }
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, session) => setEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const getAuthHeader = useCallback(async () => {
    if (AUTH_MODE === 'dev') {
      const e = local.get(DEV_KEY);
      return e ? `Dev ${e}` : null;
    }
    const { data } = await supabase().auth.getSession();
    return data.session ? `Bearer ${data.session.access_token}` : null;
  }, []);

  const sendMagicLink = useCallback(async (address: string) => {
    const { error } = await supabase().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw new Error(error.message);
  }, []);

  const devSignIn = useCallback((address: string) => {
    local.set(DEV_KEY, address.trim().toLowerCase());
    setEmail(address.trim().toLowerCase());
  }, []);

  const signOut = useCallback(async () => {
    if (AUTH_MODE === 'dev') local.set(DEV_KEY, null);
    else await supabase().auth.signOut();
    local.set('artemis.org', null);
    setEmail(null);
  }, []);

  const value = useMemo(
    () => ({ ready, email, getAuthHeader, sendMagicLink, devSignIn, signOut }),
    [ready, email, getAuthHeader, sendMagicLink, devSignIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  // i18n-ignore : message destiné aux développeurs.
  if (!ctx) throw new Error('useAuth hors AuthProvider');
  return ctx;
}
