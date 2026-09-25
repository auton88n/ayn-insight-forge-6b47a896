import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4389', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4389',
    url: 'http://127.0.0.1:4389',
    reuseExistingServer: !process.env.CI,
  },
});
