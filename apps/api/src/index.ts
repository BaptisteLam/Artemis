import { createApp } from './app';
import type { Env } from './env';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const { runScheduledFromEnv } = await import('./cron');
    ctx.waitUntil(runScheduledFromEnv(env));
  },
} satisfies ExportedHandler<Env>;
