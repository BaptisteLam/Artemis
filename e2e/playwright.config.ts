import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  webServer: [
    { command: 'pnpm exec tsx e2e/server.ts', url: 'http://localhost:8787/health', reuseExistingServer: false, cwd: '..', timeout: 60_000 },
    {
      command: 'pnpm --filter app exec vite build --outDir dist-e2e && pnpm --filter app exec vite preview --outDir dist-e2e --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      cwd: '..',
      timeout: 120_000,
      env: { VITE_AUTH_MODE: 'dev', VITE_API_URL: 'http://localhost:8787' },
    },
  ],
});
