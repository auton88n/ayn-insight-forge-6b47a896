import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4389', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4389',
    // Synthetic configuration only: the suite intercepts every external request.
    // CI has no local .env, and the app deliberately refuses a missing key.
    env: { VITE_SUPABASE_URL: 'https://ayn-test.invalid', VITE_SUPABASE_ANON_KEY: 'local-browser-fixture' },
    url: 'http://127.0.0.1:4389',
    reuseExistingServer: !process.env.CI,
  },
});
