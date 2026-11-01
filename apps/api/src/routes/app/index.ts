import { Hono } from 'hono';
import type { AppEnv } from '../../http/types';
import { userAuth } from '../../http/auth';
import { orgRoutes } from './orgs';
import { agentRoutes } from './agents';
import { bankingRoutes } from './banking';
import { activityRoutes } from './activity';
import { complianceRoutes } from './compliance';

export const appRoutes = new Hono<AppEnv>();
appRoutes.use('*', userAuth);
appRoutes.route('/', orgRoutes);
appRoutes.route('/', agentRoutes);
appRoutes.route('/', bankingRoutes);
appRoutes.route('/', activityRoutes);
appRoutes.route('/', complianceRoutes);
