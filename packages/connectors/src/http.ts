import { ArtemisError } from '@artemis/shared';

/** Encode un objet imbriqué au format x-www-form-urlencoded de Stripe (a[b][0][c]=…). */
export function formEncode(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? formEncode(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[]`, String(item))));
    else if (typeof v === 'object') formEncode(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

/** Erreur bancaire exposable : code fourni par la banque, jamais le corps brut. */
export async function bankError(provider: string, res: Response): Promise<ArtemisError> {
  let code = String(res.status);
  try {
    const j = (await res.json()) as { error?: { code?: string; type?: string } | string; code?: string; errors?: { code?: string }[] };
    if (typeof j.error === 'object' && j.error) code = j.error.code ?? j.error.type ?? code;
    else if (typeof j.error === 'string') code = j.error;
    else code = j.code ?? j.errors?.[0]?.code ?? code;
  } catch {
    /* corps non JSON */
  }
  return new ArtemisError('bank_error', `${provider} a refusé l'opération (${String(code).replace(/[^\w.-]/g, '').slice(0, 60)}).`);
}
