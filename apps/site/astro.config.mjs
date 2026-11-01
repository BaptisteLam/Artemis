import { defineConfig } from 'astro/config';
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://artemis.pages.dev',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
