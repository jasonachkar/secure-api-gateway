import { test as base, expect, type Page } from '@playwright/test';

type WorkerFixtures = { reviewerPage: Page };

export const test = base.extend<{}, WorkerFixtures>({
  reviewerPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext({
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
      });
      const page = await context.newPage();
      await page.goto('/login');
      await page.getByText('Enter read-only demo').click();
      await expect(page).toHaveURL('/');
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],
});

/** Navigate inside the live authenticated SPA without forcing another refresh-cookie
 * bootstrap. Full page reloads are reserved for the tests that explicitly verify session
 * restoration, so the shared worker never replays an already-rotated cookie. */
export async function navigateAuthenticated(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await expect(page.locator('.app-shell')).toBeVisible();
}

export { expect };
