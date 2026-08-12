import { defineConfig } from 'vitest/config';

// Separate from vitest.config.ts on purpose: these are real HTTP calls
// against the live deployed backend (real accounts, real cleanup), not
// jsdom-rendered component tests, and the frontend's setupTests.ts (mocks
// localStorage/navigator/FileReader for jsdom) has no place here and could
// break in a plain Node environment. Run with: npm run test:integration
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Integration tests share real, rate-limited backend state (credit
    // ledgers, the rate limiter itself) — run them one at a time so they
    // can't race each other's setup/teardown.
    fileParallelism: false,
  },
});
