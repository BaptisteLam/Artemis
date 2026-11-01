import { SandboxConnector, type SandboxState } from './sandbox';
import type { BankConnector, ConnectorDeps, Provider } from './types';

export function createConnector(provider: Provider, credentials: unknown, deps: ConnectorDeps = {}): BankConnector {
  switch (provider) {
    case 'sandbox':
      return new SandboxConnector(credentials as SandboxState, deps);
    default:
      throw new Error(`Connecteur ${provider} indisponible`);
  }
}
