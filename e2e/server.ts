/** Serveur API local pour les tests E2E et le développement : Store mémoire, auth « Dev ». */
import { serve } from '@hono/node-server';
import { createApp } from '../apps/api/src/app';
import { TEST_ENV } from '../apps/api/src/env';

const app = createApp();
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: (req) => app.fetch(req, { ...TEST_ENV, API_ORIGIN: `http://localhost:${port}` }), port });
console.log(`artemis api (mémoire) sur http://localhost:${port}`);
