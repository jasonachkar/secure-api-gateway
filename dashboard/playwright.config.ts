import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  // fullyParallel: false only serializes tests *within* a file - separate spec files still
  // run concurrently across workers by default. This suite shares one real backend/Redis
  // and a small RATE_LIMIT_AUTH_MAX, and some tests (guided-scenario runs, admin logins)
  // mutate shared server-side state - so run every spec file on a single worker, the same
  // effective behavior the suite had back when it was one file.
  workers: 1,
  retries: 0,
  reporter: 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    // Populated once by global-setup.ts's real demo-login - reused by every test so the
    // suite doesn't blow through RATE_LIMIT_AUTH_MAX by logging in fresh per test. Tests
    // that need to exercise the login flow itself override with `test.use({ storageState:
    // { cookies: [], origins: [] } })`.
    storageState: 'playwright/.auth/reviewer.json',
  },
});
