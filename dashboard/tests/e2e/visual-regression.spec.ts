import { type Page } from '@playwright/test';
import { test, expect, navigateAuthenticated } from './fixtures';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';

async function openWithTheme(page: Page, path: string, theme: 'light' | 'dark') {
  await page.addInitScript((value) => localStorage.setItem('dashboard-theme', value), theme);
  await page.goto(`${BASE_URL}${path}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

test.describe('Critical public surfaces', () => {
  test('landing hero remains stable in light mode', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openWithTheme(page, '/landing', 'light');
    await expect(page.locator('.product-hero')).toHaveScreenshot('landing-hero-light.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
    });
  });

  test('landing hero remains usable on a dark mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWithTheme(page, '/landing', 'dark');
    await expect(page.locator('.product-hero')).toHaveScreenshot('landing-hero-mobile-dark.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.04,
    });
  });

  test('reviewer entry card remains stable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openWithTheme(page, '/login', 'light');
    await expect(page.locator('.auth-card--redesigned')).toHaveScreenshot(
      'reviewer-login-card-light.png',
      {
        animations: 'disabled',
        maxDiffPixelRatio: 0.03,
      }
    );
  });
});

const CRITICAL_WORKFLOWS = [
  { name: 'overview', path: '/' },
  { name: 'traffic', path: '/traffic' },
  { name: 'detections', path: '/detections' },
  { name: 'investigations', path: '/investigations' },
  { name: 'security-lab', path: '/security-lab' },
  { name: 'cloud', path: '/cloud' },
  { name: 'audit', path: '/audit' },
] as const;

test.describe('Authenticated workflow identity', () => {
  for (const route of CRITICAL_WORKFLOWS) {
    test(`${route.name} page hierarchy remains stable across themes and breakpoints`, async ({
      reviewerPage: page,
    }) => {
      for (const viewport of [
        { name: 'desktop', width: 1440, height: 1000 },
        { name: 'mobile', width: 390, height: 844 },
      ] as const) {
        await page.setViewportSize(viewport);
        await navigateAuthenticated(page, route.path);

        for (const theme of ['light', 'dark'] as const) {
          await page.getByLabel('Color theme').selectOption(theme);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await expect(page.locator('.section-header')).toHaveScreenshot(
            `${route.name}-${viewport.name}-${theme}-header.png`,
            { animations: 'disabled', maxDiffPixelRatio: 0.03 }
          );
        }
      }
    });
  }
});
