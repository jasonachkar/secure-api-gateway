import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5173';
const phase = process.argv[2] || 'current';
const selectedRouteNames = new Set(process.argv.slice(3));
const outputRoot = path.resolve('../docs/screenshots/redesign', phase);

const viewports = {
  desktop: { width: 1440, height: 1000 },
  tablet: { width: 1024, height: 900 },
  mobile: { width: 390, height: 844 },
};

const publicRoutes = [
  { name: 'landing', path: '/landing' },
  { name: 'login', path: '/login' },
];

const authenticatedRoutes = [
  { name: 'overview', path: '/' },
  { name: 'traffic', path: '/traffic' },
  { name: 'detections', path: '/detections' },
  { name: 'investigations', path: '/investigations' },
  { name: 'security-lab', path: '/security-lab' },
  { name: 'cloud', path: '/cloud' },
  { name: 'control-evidence', path: '/compliance' },
  { name: 'audit', path: '/audit' },
  { name: 'threats', path: '/threats' },
  { name: 'sessions', path: '/sessions' },
  { name: 'identities', path: '/identities' },
  { name: 'architecture', path: '/architecture' },
  { name: 'implementation-status', path: '/implementation-status' },
];

const routesForCapture = (routes) =>
  selectedRouteNames.size ? routes.filter((route) => selectedRouteNames.has(route.name)) : routes;

async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  await page.waitForTimeout(600);
}

async function capture(page, route, theme, viewportName, spa = false) {
  if (spa) {
    // Exercise React Router through a real Link click. Dispatching a synthetic popstate
    // from a standalone Node script is not observed consistently across browser/runtime
    // versions, while HTMLElement.click() keeps the access token in memory and works even
    // when the responsive sidebar is visually off-canvas.
    await page
      .locator(`a[href="${route.path}"]`)
      .first()
      .evaluate((link) => link.click());
    await page.waitForURL((url) => url.pathname === route.path);
  } else {
    await page.goto(`${baseUrl}${route.path}`);
  }
  await settle(page);
  await page.screenshot({
    path: path.join(outputRoot, `${route.name}-${viewportName}-${theme}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

await mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch();

try {
  for (const theme of ['light', 'dark']) {
    const publicContext = await browser.newContext({ viewport: viewports.desktop });
    await publicContext.addInitScript((selectedTheme) => {
      localStorage.setItem('dashboard-theme', selectedTheme);
    }, theme);
    const publicPage = await publicContext.newPage();

    for (const [viewportName, viewport] of Object.entries(viewports)) {
      await publicPage.setViewportSize(viewport);
      for (const route of routesForCapture(publicRoutes)) {
        await capture(publicPage, route, theme, viewportName);
      }
    }
    await publicContext.close();

    const appContext = await browser.newContext({ viewport: viewports.desktop });
    await appContext.addInitScript((selectedTheme) => {
      localStorage.setItem('dashboard-theme', selectedTheme);
    }, theme);
    const appPage = await appContext.newPage();
    await appPage.goto(`${baseUrl}/login`);
    await appPage.getByText('Enter read-only demo').click();
    await appPage.waitForURL(`${baseUrl}/`);

    for (const [viewportName, viewport] of Object.entries(viewports)) {
      await appPage.setViewportSize(viewport);
      for (const route of routesForCapture(authenticatedRoutes)) {
        await capture(appPage, route, theme, viewportName, true);
      }
    }
    await appContext.close();
  }
} finally {
  await browser.close();
}

console.log(`Captured redesign screenshots in ${outputRoot}`);
