import { ArtemisError, fromBase64Url } from '@artemis/shared';
import type { Ctx } from './context';
import { audit, type Actor } from './audit';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

function typeFor(filename: string, declared?: string | null): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const t = TYPES[ext];
  if (!t || (declared && declared !== t && !(declared.startsWith('image/jpeg') && t === 'image/jpeg'))) {
    throw new ArtemisError('invalid_input', 'Justificatif accepté : PDF, PNG ou JPEG.');
  }
  return t;
}

export function decodeBase64(b64: string): Uint8Array<ArrayBuffer> {
  const clean = b64.replace(/^data:[^,]+,/, '').replace(/\s/g, '');
  return fromBase64Url(clean.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
}

export async function addReceipt(
  ctx: Ctx,
  actor: Actor,
  orgId: string,
  requestId: string,
  file: { filename: string; bytes: Uint8Array<ArrayBuffer> | ArrayBuffer; contentType?: string | null },
) {
  const request = await ctx.store.getCardRequest(requestId);
  if (!request || request.org_id !== orgId) throw new ArtemisError('not_found', 'Demande introuvable.');
  if (actor.type === 'agent' && request.agent_id !== actor.id) throw new ArtemisError('not_found', 'Demande introuvable.');
  const filename = file.filename.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'justificatif';
  const contentType = typeFor(filename, file.contentType);
  const body = file.bytes instanceof Uint8Array ? file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) : file.bytes;
  if (body.byteLength === 0 || body.byteLength > MAX_RECEIPT_BYTES) throw new ArtemisError('invalid_input', 'Justificatif vide ou supérieur à 10 Mo.');
  const path = `${orgId}/${requestId}/${crypto.randomUUID()}-${filename.replace(/\s+/g, '_')}`;
  await ctx.store.putFile(path, body, contentType);
  const receipt = await ctx.store.createReceipt({
    org_id: orgId,
    request_id: requestId,
    storage_path: path,
    filename,
    content_type: contentType,
    size_bytes: body.byteLength,
    uploaded_by: `${actor.type}:${actor.id}`,
  });
  await audit(ctx, orgId, actor, 'receipt.attached', requestId, { receipt_id: receipt.id, filename });
  return receipt;
}

/** Télécharge un justificatif depuis une URL https publique (≤ 10 Mo). */
export async function fetchReceiptUrl(ctx: Ctx, url: string): Promise<{ bytes: ArrayBuffer; contentType: string | null; filename: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ArtemisError('invalid_input', 'URL de justificatif invalide.');
  }
  if (u.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) {
    throw new ArtemisError('invalid_input', 'Seules les URL https publiques sont acceptées.');
  }
  const res = await ctx.fetch(u.toString(), { redirect: 'follow' });
  if (!res.ok) throw new ArtemisError('invalid_input', `Téléchargement impossible (${res.status}).`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_RECEIPT_BYTES) throw new ArtemisError('invalid_input', 'Justificatif supérieur à 10 Mo.');
  const bytes = await res.arrayBuffer();
  const ct = res.headers.get('content-type')?.split(';')[0] ?? null;
  const name = u.pathname.split('/').pop() || 'justificatif';
  const ext = ct === 'application/pdf' ? 'pdf' : ct === 'image/png' ? 'png' : ct === 'image/jpeg' ? 'jpg' : '';
  return { bytes, contentType: ct, filename: /\.(pdf|png|jpe?g)$/i.test(name) || !ext ? name : `${name}.${ext}` };
}
