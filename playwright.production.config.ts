import { defineConfig } from '@playwright/test';

// Build first. CI builds with a synthetic API configuration; every external
// request is blocked by the tests even when a developer builds with real env.
export default defineConfig({
  testDir: './tests/browser-production',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4390', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4390',
    url: 'http://127.0.0.1:4390',
    reuseExistingServer: !process.env.CI,
  },
});
