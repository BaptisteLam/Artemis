import type { AgentRow, MembershipRow, OrganizationRow } from '@artemis/db';
import type { Env } from '../env';
import type { Ctx, UserInfo } from '../services/context';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    ctx: Ctx;
    agent: AgentRow;
    org: OrganizationRow;
    user: UserInfo;
    membership: MembershipRow;
  };
};
