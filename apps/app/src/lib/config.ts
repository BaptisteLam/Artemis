export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';
export const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'https://artemis.pages.dev';
export const AUTH_MODE: 'dev' | 'supabase' = import.meta.env.VITE_AUTH_MODE === 'dev' ? 'dev' : 'supabase';
export const MCP_URL = `${API_URL}/mcp`;
