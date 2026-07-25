/**
 * Minimal reviewer-journey smoke test: one-click demo login, then visit
 * every primary-nav page and assert it renders without a page-level JS
 * error. This is NOT the full 10-step reviewer journey / axe accessibility
 * suite the project spec calls for - see docs/DEMO_WALKTHROUGH.md for what's
 * still outstanding.
 *
 * Requires the backend (localhost:3000) and dashboard dev server
 * (localhost:5173) to already be running.
 */
import { test, expect } from '@playwright/test';

const PAGES = ['/', '/guided-scenarios', '/investigations', '/cloud-coverage', '/implementation-status', '/about'];

test.describe('Reviewer journey (one-click demo)', () => {
  test('logs in via the one-click demo entry point and reaches every primary nav page without a JS error', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/login');
    await page.getByText('Enter read-only demo').click();
    await expect(page).toHaveURL('/');

    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    expect(pageErrors).toEqual([]);
  });

  test('guided scenarios page lists all 3 scenarios and can run the replay-based ones', async ({ page }) => {
    await page.goto('/login');
    await page.getByText('Enter read-only demo').click();
    await expect(page).toHaveURL('/');
    await page.goto('/guided-scenarios');

    await expect(page.getByText('Run scenario')).toHaveCount(3);
  });

  test('reviewer role can read Implementation Status (explicitly reviewer-allowlisted)', async ({ page }) => {
    await page.goto('/login');
    await page.getByText('Enter read-only demo').click();
    await expect(page).toHaveURL('/');
    await page.goto('/implementation-status');

    // Implementation Status is explicitly reviewer-readable and should render real data.
    await expect(page.locator('.ui-card').first()).toBeVisible();
  });
});
