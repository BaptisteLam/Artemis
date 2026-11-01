import { ArtemisError } from '@artemis/shared';
import { createConnector, decryptCredentials, encryptCredentials, type BankConnector } from '@artemis/connectors';
import type { BankConnectionRow } from '@artemis/db';
import type { Ctx } from './context';

/** Instancie le connecteur d'une connexion ; les identifiants mis à jour sont rechiffrés et persistés. */
export async function connectorFor(ctx: Ctx, conn: BankConnectionRow): Promise<BankConnector> {
  let creds: unknown;
  try {
    creds = await decryptCredentials(conn.credentials_ciphertext, ctx.env.CONNECTIONS_KEY);
  } catch {
    throw new ArtemisError('bank_error', 'Identifiants bancaires illisibles : reconnectez la banque.');
  }
  return createConnector(conn.provider, creds, {
    fetch: ctx.fetch,
    now: ctx.now,
    onCredentialsUpdate: async (next) => {
      await ctx.store.updateBankConnection(conn.id, {
        credentials_ciphertext: await encryptCredentials(next, ctx.env.CONNECTIONS_KEY),
      });
    },
  });
}

export async function connectorForAgentConnection(ctx: Ctx, connectionId: string | null) {
  if (!connectionId) throw new ArtemisError('bank_error', 'Aucune banque n’est reliée à cet agent.');
  const conn = await ctx.store.getBankConnection(connectionId);
  if (!conn) throw new ArtemisError('bank_error', 'La banque de cet agent a été supprimée.');
  return { conn, connector: await connectorFor(ctx, conn) };
}
