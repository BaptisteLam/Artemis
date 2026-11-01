import { SandboxConnector, type SandboxState } from './sandbox';
import { StripeIssuingConnector, type StripeCredentials } from './stripe';
import { QontoConnector, type QontoCredentials } from './qonto';
import { RevolutConnector, type RevolutCredentials } from './revolut';
import type { BankConnector, ConnectorDeps, Provider } from './types';

export function createConnector(provider: Provider, credentials: unknown, deps: ConnectorDeps = {}): BankConnector {
  switch (provider) {
    case 'sandbox':
      return new SandboxConnector(credentials as SandboxState, deps);
    case 'stripe':
      return new StripeIssuingConnector(credentials as StripeCredentials, deps);
    case 'qonto':
      return new QontoConnector(credentials as QontoCredentials, deps);
    case 'revolut':
      return new RevolutConnector(credentials as RevolutCredentials, deps);
    default:
      throw new Error(`Connecteur ${provider} indisponible`);
  }
}
