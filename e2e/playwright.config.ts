import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  webServer: [
    { command: 'pnpm exec tsx e2e/server.ts', url: 'http://localhost:8787/health', reuseExistingServer: true, cwd: '..', timeout: 60_000 },
    {
      command: 'pnpm --filter app build && pnpm --filter app preview',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      cwd: '..',
      timeout: 120_000,
      env: { VITE_AUTH_MODE: 'dev', VITE_API_URL: 'http://localhost:8787' },
    },
  ],
});
