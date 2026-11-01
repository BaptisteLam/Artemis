import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { ApiClient } from './api';

export async function enrollPasskey(api: ApiClient, name?: string) {
  const options = await api<Parameters<typeof startRegistration>[0]['optionsJSON']>('/app/passkeys/register/options', { method: 'POST' });
  const response = await startRegistration({ optionsJSON: options });
  return api('/app/passkeys/register/verify', { method: 'POST', body: { response, name } });
}

/** Signe le mandat d'une demande avec une passkey puis l'approuve. */
export async function approveWithPasskey(api: ApiClient, requestId: string) {
  const { options } = await api<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON']; mandate_hash: string }>(
    `/app/requests/${requestId}/approve/options`,
    { method: 'POST' },
  );
  const response = await startAuthentication({ optionsJSON: options });
  return api(`/app/requests/${requestId}/approve`, { method: 'POST', body: { response } });
}

export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}
