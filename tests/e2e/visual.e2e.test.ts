import { expect, test } from '@playwright/test';

import {
  navigateInApp,
  registerNewUserAndGoToDashboard,
} from '@/tests/utils/e2e-auth.ts';
import { expectAuthScreenReady, gotoApp } from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.describe('Visual Regression', () => {
  test('login page (light mode)', async ({ page }) => {
    await gotoApp(page, '/login');
    await expectAuthScreenReady(page);
    await expect(page).toHaveScreenshot('login-light.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('login page (dark mode)', async ({ page }) => {
    await gotoApp(page, '/login');
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expectAuthScreenReady(page);
    await expect(page).toHaveScreenshot('login-dark.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('login page (theme extremes — floating elevation + glow focus)', async ({
    page,
  }) => {
    await gotoApp(page, '/login');
    await page.evaluate(() => {
      document.documentElement.dataset.elevation = 'floating';
      document.documentElement.dataset.focus = 'glow';
    });
    await expectAuthScreenReady(page);
    await expect(page).toHaveScreenshot('login-theme-extremes.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('login page (dark + hairline separation)', async ({ page }) => {
    await gotoApp(page, '/login');
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.dataset.separation = 'hairline';
      document.documentElement.dataset.menu = 'glass';
    });
    await expectAuthScreenReady(page);
    await expect(page).toHaveScreenshot('login-dark-glass-hairline.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('dashboard page', async ({ page }) => {
    await registerNewUserAndGoToDashboard(page);
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });

    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
      animations: 'disabled',
    });
  });

  test('404 page (light mode)', async ({ page }) => {
    await gotoApp(page, '/definitely-not-a-route');
    await expect(page.getByTestId('not-found-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveScreenshot('404-light.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('404 page (dark mode)', async ({ page }) => {
    await gotoApp(page, '/definitely-not-a-route');
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page.getByTestId('not-found-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveScreenshot('404-dark.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('accept-invite error card (light mode)', async ({ page }) => {
    // The error card is a SIGNED-IN state: the route is auth-required (INV-4), so a
    // guest is redirected to sign-in before this page ever renders.
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (mail_outbox)',
    );
    await registerNewUserAndGoToDashboard(page);
    await navigateInApp(page, '/accept-invite/inv_expired');
    await expect(page.getByTestId('accept-invite-error')).toBeVisible({
      timeout: 10000,
    });
    await expect(page).toHaveScreenshot('accept-invite-error-light.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
});
