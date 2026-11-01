import { ArtemisError, type ErrorCode } from '@artemis/shared';

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  raw?: boolean;
}

export interface ApiClientConfig {
  baseUrl: string;
  getAuthHeader: () => Promise<string | null>;
  getOrgId: () => string | null;
  fetch?: typeof fetch;
}

export type ApiClient = <T = unknown>(path: string, opts?: ApiOptions) => Promise<T>;

export function createApiClient(cfg: ApiClientConfig): ApiClient {
  const f = cfg.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
    const headers: Record<string, string> = {};
    const auth = await cfg.getAuthHeader();
    if (auth) headers.Authorization = auth;
    const org = cfg.getOrgId();
    if (org) headers['X-Org-Id'] = org;
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    let res: Response;
    try {
      res = await f(`${cfg.baseUrl}${path}`, { method: opts.method ?? 'GET', headers, body });
    } catch {
      throw new ArtemisError('internal', 'Réseau indisponible. Vérifiez votre connexion.');
    }
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: { code?: ErrorCode; message?: string } } | null;
      throw new ArtemisError(payload?.error?.code ?? 'internal', payload?.error?.message ?? `Erreur ${res.status}`);
    }
    if (opts.raw) return res as unknown as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  };
}
