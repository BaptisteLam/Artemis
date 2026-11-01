import type { Env } from '../env';
import type { Store } from '../store/types';

export interface Notifier {
  requestPending(orgId: string, requestId: string): Promise<void>;
  cardIssueFailed(orgId: string, requestId: string): Promise<void>;
  transactionMismatch(orgId: string, transactionId: string): Promise<void>;
  invitation(email: string, orgName: string, link: string): Promise<void>;
}

export const noopNotifier: Notifier = {
  async requestPending() {},
  async cardIssueFailed() {},
  async transactionMismatch() {},
  async invitation() {},
};

export interface Ctx {
  env: Env;
  store: Store;
  now: () => Date;
  fetch: typeof fetch;
  notify: Notifier;
  /** Planifie un travail après la réponse (waitUntil sur Workers). */
  defer: (p: Promise<unknown>) => void;
}

export interface UserInfo {
  id: string;
  email: string;
  isAdmin: boolean;
}
