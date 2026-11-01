import { SandboxConnector, type SandboxState } from './sandbox';
import { StripeIssuingConnector, type StripeCredentials } from './stripe';
import type { BankConnector, ConnectorDeps, Provider } from './types';

export function createConnector(provider: Provider, credentials: unknown, deps: ConnectorDeps = {}): BankConnector {
  switch (provider) {
    case 'sandbox':
      return new SandboxConnector(credentials as SandboxState, deps);
    case 'stripe':
      return new StripeIssuingConnector(credentials as StripeCredentials, deps);
    default:
      throw new Error(`Connecteur ${provider} indisponible`);
  }
}
