import { defineConfig } from '@playwright/test';
import { localSupabase } from './scripts/local-supabase.mjs';

const { url, publishableKey } = localSupabase();
if (!publishableKey?.startsWith('sb_publishable_'))
  throw new Error('Chave publicável local indisponível.');

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    env: {
      VITE_APP_MODE: 'local',
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    },
  },
});
