import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ArtemisError } from '@artemis/shared';
import { useAuth } from '../auth/AuthProvider';
import { createApiClient, type ApiClient } from './api';
import { API_URL } from './config';
import { local } from './storage';
import type { Me, OrgInfo } from './types';

interface OrgState {
  api: ApiClient;
  me: Me | null;
  loading: boolean;
  error: ArtemisError | null;
  orgId: string | null;
  org: OrgInfo | null;
  setOrgId: (id: string) => void;
  refresh: () => Promise<void>;
  can: (...roles: Array<'owner' | 'admin' | 'approver' | 'viewer'>) => boolean;
}

const OrgContext = createContext<OrgState | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { getAuthHeader, email } = useAuth();
  const [orgId, setOrgIdState] = useState<string | null>(() => local.get('artemis.org'));
  const [me, setMe] = useState<Me | null>(null);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ArtemisError | null>(null);

  const api = useMemo(() => createApiClient({ baseUrl: API_URL, getAuthHeader, getOrgId: () => local.get('artemis.org') }), [getAuthHeader]);

  const setOrgId = useCallback((id: string) => {
    local.set('artemis.org', id);
    setOrgIdState(id);
  }, []);

  const refresh = useCallback(async () => {
    if (!email) {
      setMe(null);
      setOrg(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const m = await api<Me>('/app/me');
      setMe(m);
      const ids = m.organizations.map((o) => o.organization.id);
      let current = local.get('artemis.org');
      if (!current || !ids.includes(current)) {
        current = ids[0] ?? null;
        local.set('artemis.org', current);
        setOrgIdState(current);
      }
      setOrg(current ? await api<OrgInfo>('/app/org') : null);
      setError(null);
    } catch (e) {
      setError(e as ArtemisError);
    } finally {
      setLoading(false);
    }
  }, [api, email]);

  useEffect(() => {
    void refresh();
  }, [refresh, orgId]);

  const can = useCallback((...roles: Array<'owner' | 'admin' | 'approver' | 'viewer'>) => !!org && roles.includes(org.role), [org]);

  const value = useMemo(() => ({ api, me, loading, error, orgId, org, setOrgId, refresh, can }), [api, me, loading, error, orgId, org, setOrgId, refresh, can]);
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgState {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg hors OrgProvider');
  return ctx;
}
