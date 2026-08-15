import { expect, test } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL!;

test('production reviewer session survives refresh, recovers once, and revokes cleanly', async ({ page, request }) => {
  const corsErrors: string[] = [];
  page.on('console', (message) => {
    if (/cors/i.test(message.text())) corsErrors.push(message.text());
  });

  await page.goto('/login');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/Admin123!|User123!/)).toHaveCount(0);

  const loginResponsePromise = page.waitForResponse(
    (response) => response.url() === `${apiUrl}/auth/demo-login`
  );
  await page.getByText('Enter read-only demo').click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);
  const { accessToken } = await loginResponse.json();
  await expect(page).toHaveURL(/\/$/);

  const authenticatedApi = await request.get(`${apiUrl}/admin/metrics/summary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(authenticatedApi.status()).toBe(200);

  const refreshCookie = (await page.context().cookies(apiUrl)).find(
    (cookie) => cookie.name === 'refreshToken'
  );
  expect(refreshCookie).toBeDefined();

  await page.goto('/about');
  await page.reload();
  await expect(page).toHaveURL(/\/about$/);

  let forcedExpiry = true;
  let refreshCount = 0;
  page.on('request', (req) => {
    if (req.url() === `${apiUrl}/auth/refresh`) refreshCount += 1;
  });
  await page.route(`${apiUrl}/admin/security/capabilities`, async (route) => {
    if (forcedExpiry) {
      forcedExpiry = false;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' } }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto('/implementation-status');
  await expect(page.locator('.ui-card').first()).toBeVisible();
  expect(refreshCount).toBe(1);

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);

  const oldAccess = await request.get(`${apiUrl}/admin/metrics/summary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(oldAccess.status()).toBe(401);

  const oldRefresh = await request.post(`${apiUrl}/auth/refresh`, {
    headers: {
      Origin: new URL(page.url()).origin,
      Cookie: `refreshToken=${refreshCookie!.value}`,
    },
  });
  expect(oldRefresh.status()).toBe(401);

  const untrustedOrigin = await request.post(`${apiUrl}/auth/demo-login`, {
    headers: { Origin: 'https://untrusted.example' },
  });
  expect(untrustedOrigin.status()).toBe(403);
  expect(corsErrors).toEqual([]);
});
