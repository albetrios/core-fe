import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const FAKE_NEW_BUILD = 'cross-browser-fake-build-id';

function mockNewVersion(page: Page) {
  return page.route('**/version.json*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        buildId: FAKE_NEW_BUILD,
        builtAt: new Date().toISOString(),
      }),
    });
  });
}

test.describe('version update notification', () => {
  // The production preview registers a service worker. Once it controls the page
  // it proxies `version.json`, and a service-worker-originated request is outside
  // `page.route()` in WebKit — the mock never applied there, so the app compared
  // the real build id against itself and no toast ever appeared. Blocking the
  // worker keeps the fetch on the page, where the route interception lives.
  // (The app itself is unaffected: version.json is never precached and
  // `check.ts` fetches it with `cache: 'no-store'`.)
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.removeItem('core:version-check:reloaded-for');
        for (const key of Object.keys(sessionStorage)) {
          if (key.startsWith('core:version-check:snooze:')) {
            sessionStorage.removeItem(key);
          }
        }
      } catch {
        // privacy mode — ignore
      }
    });
  });

  test('shows Update available toast when version.json differs', async ({ page }) => {
    await mockNewVersion(page);

    await page.goto('/login');
    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 15_000 });

    // Initial version check fires ~2s after bootstrap.
    await expect(page.getByTestId('app-toast')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Update available')).toBeVisible();
    await expect(page.getByTestId('toast-action')).toHaveText('Refresh now');
  });

  test('Refresh now triggers reload', async ({ page }) => {
    await mockNewVersion(page);

    await page.goto('/login');
    await expect(page.getByTestId('app-toast')).toBeVisible({ timeout: 15_000 });

    const reloadPromise = page.waitForEvent('load');
    await page.getByTestId('toast-action').click();
    await reloadPromise;
    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 15_000 });
  });

  test('dismiss snoozes without reloading', async ({ page }) => {
    await mockNewVersion(page);

    await page.goto('/login');
    await expect(page.getByTestId('app-toast')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('toast-dismiss').click();
    await expect(page.getByTestId('app-toast')).not.toBeVisible({ timeout: 5_000 });

    await page.waitForTimeout(3_000);
    expect(page.url()).toContain('/login');
    await expect(page.getByTestId('app-toast')).not.toBeVisible();
  });
});
