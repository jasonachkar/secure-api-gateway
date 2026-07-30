/**
 * Dark-mode suite: theme persistence/init (no flash of the wrong theme), the toggle itself
 * on public and authenticated surfaces, and that every reviewer route still renders (and
 * its charts/map re-render) once dark mode is active.
 *
 * Dark is the unconditional default for a first-time visitor with no stored preference -
 * ThemeContext.tsx deliberately does not fall back to prefers-color-scheme (most OSes ship
 * light out of the box, so honoring that would default the app to light for almost
 * everyone). An explicit stored choice always wins regardless of OS preference.
 *
 * Reuses the shared reviewer storageState from global-setup.ts for authenticated routes,
 * same as reviewer-journey.spec.ts, so this suite doesn't add extra real logins and burn
 * into RATE_LIMIT_AUTH_MAX. The handful of tests that must start logged-out (default-theme
 * checks, landing/login toggle) open a fresh context with an empty storageState instead of
 * logging in again.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PRIMARY_PAGES = ['/', '/guided-scenarios', '/investigations', '/cloud-coverage', '/about'];
const MORE_PAGES = ['/compliance', '/threats', '/audit-logs', '/sessions', '/users', '/implementation-status'];
const ALL_REVIEWER_PAGES = [...PRIMARY_PAGES, ...MORE_PAGES];

const STORAGE_KEY = 'dashboard-theme';

/** Sets localStorage before any page script runs, so this is indistinguishable from a
 * real returning visitor - the same mechanism index.html's own inline pre-paint script
 * reads from. */
async function seedTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => {
    window.localStorage.setItem('dashboard-theme', t);
  }, theme);
}

test.describe('Theme: stored preference is applied before interaction', () => {
  test('stored dark mode is applied immediately on a public page', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await seedTheme(page, 'dark');
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
    await context.close();
  });

  test('stored light mode is applied immediately on a public page', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await seedTheme(page, 'light');
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
    await context.close();
  });

  test('stored dark mode is applied immediately on an authenticated page', async ({ page }) => {
    await seedTheme(page, 'dark');
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('a visitor with no stored preference defaults to dark regardless of OS dark preference', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await context.close();
  });

  test('a visitor with no stored preference defaults to dark even with OS light preference', async ({ browser }) => {
    // This is the deliberate behavior, not a bug: see the file-level comment above.
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      colorScheme: 'light',
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await context.close();
  });
});

test.describe('Theme: toggle, persistence, navigation', () => {
  // Note: these tests deliberately do NOT use seedTheme()/addInitScript once the page has
  // navigated once - addInitScript re-runs on every subsequent navigation (including
  // page.reload()), which would re-seed over whatever the app itself just persisted and
  // defeat the point of a real persistence test. They rely on the shared reviewer
  // storageState carrying no stored theme, so the app starts from its default (dark - see
  // the file-level comment above), then toggles to light to prove an explicit choice
  // overrides that default and survives navigation/reload.

  test('the sidebar toggle changes the active theme and persists across reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe('light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();

    // Leave the shared reviewer session the way other tests in this suite expect it.
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  });

  test('the choice survives client-side navigation between authenticated routes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // In-app nav-link clicks are client-side route pushes (no full document reload), so this
    // exercises the app's own persistence/rerender rather than a freshly-seeded document.
    // "Audit Logs" lives in the collapsible "More" section - expand it first.
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('link', { name: /Audit Logs/ }).click();
    await expect(page).toHaveURL(/audit-logs/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('link', { name: /Overview/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // A full reload (new document) must still pick the persisted value back up.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  });

  test('toggling to light mode updates the document immediately', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');

    // Leave the shared reviewer session the way other tests in this suite expect it.
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  });
});

test.describe('Theme: public-page toggles (before authentication)', () => {
  test('the landing page toggle works before signing in', async ({ browser }) => {
    // No seedTheme() here deliberately - see the note above the previous describe block.
    // No stored preference, so the page starts from the default (dark).
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Persists into the login page too, without needing to sign in first.
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await context.close();
  });

  test('the login page toggle works before signing in', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await seedTheme(page, 'light');
    await page.goto('/login');

    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe('dark');
    await context.close();
  });
});

test.describe('Theme: every reviewer route renders in dark mode', () => {
  for (const path of ALL_REVIEWER_PAGES) {
    test(`${path} renders in dark mode without a page error`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));
      await seedTheme(page, 'dark');

      await page.goto(path);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(pageErrors).toEqual([]);
    });
  }
});

test.describe('Theme: charts and map survive a theme toggle', () => {
  test('dashboard chart SVGs remain rendered after toggling from light to dark', async ({ page }) => {
    await seedTheme(page, 'light');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Charts only render once at least one SSE data point has arrived; skip quietly if this
    // environment's realtime feed never connects (unrelated to theming).
    const chart = page.locator('.chart-card .recharts-wrapper').first();
    const chartAppeared = await chart.isVisible({ timeout: 15000 }).catch(() => false);
    test.skip(!chartAppeared, 'No realtime chart data arrived in this environment');

    const svgBefore = await chart.locator('svg.recharts-surface').count();
    expect(svgBefore).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await expect(chart.locator('svg.recharts-surface').first()).toBeVisible();
    const svgAfter = await chart.locator('svg.recharts-surface').count();
    expect(svgAfter).toBe(svgBefore);
  });

  test('the threat map re-renders after toggling theme, when a map is present', async ({ page }) => {
    await seedTheme(page, 'light');
    await page.goto('/threats');
    await page.waitForLoadState('networkidle');

    const map = page.locator('.world-map svg');
    const mapPresent = await map.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!mapPresent, 'No threat data with geo info in this environment - map is conditionally rendered');

    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(map).toBeVisible();
    expect(await page.locator('.world-map path').count()).toBeGreaterThan(0);
  });
});

test.describe('Accessibility (axe): dark mode', () => {
  test('login page has no serious or critical accessibility violations in dark mode', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await seedTheme(page, 'dark');
    await page.goto('/login');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    await context.close();
  });

  test('landing page has no serious or critical accessibility violations in dark mode', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await seedTheme(page, 'dark');
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    await context.close();
  });

  for (const path of ALL_REVIEWER_PAGES) {
    test(`${path} has no serious or critical accessibility violations in dark mode`, async ({ page }) => {
      await seedTheme(page, 'dark');
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});
