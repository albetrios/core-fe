import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { registerNewUserAndGoToDashboard } from '@/tests/utils/e2e-auth.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * Locale & direction preferences through the Appearance panel — the 11-locale
 * i18n runtime had no E2E pin. Direction and language must apply live to
 * `<html>` and survive a reload (persisted store + pre-paint init script).
 */
test.describe('Locale & RTL preferences', () => {
  test.beforeEach(async () => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    );
  });

  async function openAppearance(page: Page) {
    await page.getByRole('button', { name: /open appearance/i }).click();
    await expect(page.getByTestId('appearance-panel')).toBeVisible({
      timeout: 10_000,
    });
  }

  test('forcing RTL flips the document live and auto restores it', async ({ page }) => {
    test.setTimeout(120_000);
    await registerNewUserAndGoToDashboard(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await openAppearance(page);
    await page.getByTestId('text-direction-rtl').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // Back to auto restores the language's own direction.
    await page.getByTestId('text-direction-auto').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('RTL preference survives a reload on a signed-in page', async ({ page }) => {
    // KNOWN REGRESSION: reloading an authenticated page fires two /auth/refresh
    // calls (silentRefresh + refreshAccessToken are separately single-flighted);
    // the second sends the pre-rotation CSRF cookie, gets 403, and force-logs
    // the session out. Re-enable once the boot refresh is truly single-flight.
    test.fixme(true, 'authenticated reload bounces to /login (double-refresh CSRF race)');
    test.setTimeout(120_000);
    await registerNewUserAndGoToDashboard(page);
    await openAppearance(page);
    await page.getByTestId('text-direction-rtl').click();
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('switching the UI language to Arabic translates and flips direction', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await registerNewUserAndGoToDashboard(page);

    await openAppearance(page);
    const arabic = page.getByTestId('language-ar');
    const pickerShown = await arabic
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!pickerShown, 'single-locale build — language picker hidden');
    await arabic.click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'ar', {
      timeout: 15_000,
    });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar', {
      timeout: 20_000,
    });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});
