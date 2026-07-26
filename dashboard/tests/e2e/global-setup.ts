/**
 * Logs in once via the real one-click demo entry point and saves the resulting
 * session (cookies + localStorage access token) to disk, so every spec file
 * reuses one authenticated session instead of calling POST /auth/demo-login
 * per test. That's not just faster - it's necessary: RATE_LIMIT_AUTH_MAX
 * defaults to 5 and a suite with a dozen-plus tests each logging in fresh
 * blows through it, turning later tests' logins into real 429s. It also
 * matches actual reviewer behavior (log in once, browse many pages).
 */
import { chromium, type FullConfig } from '@playwright/test';

const STORAGE_STATE_PATH = 'playwright/.auth/reviewer.json';

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:5173';
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });

  await page.goto('/login');
  await page.getByText('Enter read-only demo').click();
  await page.waitForURL('/');

  await page.context().storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}

export { STORAGE_STATE_PATH };
