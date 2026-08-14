import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/azure',
  timeout: 60_000,
  workers: 1,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: 'retain-on-failure',
  },
});
