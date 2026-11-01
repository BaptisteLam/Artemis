import { useCallback, useEffect, useState } from 'react';
import type { ArtemisError } from '@artemis/shared';
import { useOrg } from './OrgProvider';

/** Charge une ressource de l'API et expose rechargement, chargement et erreur. */
export function useData<T>(path: string | null, deps: unknown[] = []) {
  const { api, orgId } = useOrg();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ArtemisError | null>(null);
  const [loading, setLoading] = useState(!!path);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e as ArtemisError);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, path, orgId, ...deps]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}
