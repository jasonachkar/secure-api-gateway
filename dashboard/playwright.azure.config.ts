import { defineConfig } from '@playwright/test';
import { requiredHttpsOrigin } from './tests/azure/environment';

const baseURL = requiredHttpsOrigin('E2E_BASE_URL');
requiredHttpsOrigin('E2E_API_URL');

export default defineConfig({
  testDir: './tests/azure',
  timeout: 60_000,
  workers: 1,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
});
