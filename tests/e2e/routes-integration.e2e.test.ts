import { expect, test } from '@playwright/test';

import { APP_TITLE } from '@/lib/routes/page-head.ts';
import {
  authenticateViaEmailCodeAndLand,
  registerNewUserAndGoToDashboard,
} from '@/tests/utils/e2e-auth.ts';
import {
  clickTestId,
  expectAppHeaderReady,
  expectAuthScreenReady,
  expectLoginFormReady,
  gotoApp,
  navigateAuthenticated,
  openSettingsHash,
} from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * End-to-end route matrix against live core-be (:3000) + FE dev/preview.
 * Run across Chromium, Firefox, and WebKit via `pnpm test:e2e:integration:cross-browser`.
 */
test.describe('Live routes integration', () => {
  test.describe('public routes', () => {
    test('login shell is reachable without auth', async ({ page }) => {
      await gotoApp(page, '/login');
      await expectAuthScreenReady(page);
    });

    test('MFA page shows session-expired state without a handoff token', async ({
      page,
    }) => {
      await gotoApp(page, '/mfa');
      await expect(page.getByTestId('mfa-page')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('mfa-form')).toBeVisible();
      await expect(page.getByRole('heading', { name: /session expired/i })).toBeVisible();
    });

    test('OAuth callback without a session returns to login', async ({ page }) => {
      await gotoApp(page, '/callback/google');
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
      await expectLoginFormReady(page);
    });

    test('accept-invite sends a guest to sign-in with the invite as the redirect', async ({
      page,
    }) => {
      // Not a public page any more (INV-4): the accept needs a session whose email
      // matches the invite, so the guard asks for one before the page renders.
      await gotoApp(page, '/accept-invite/inv_expired?token=tok_e2e_guest');
      await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 10000 });
      const redirect = new URL(page.url()).searchParams.get('redirect') ?? '';
      expect(redirect).toContain('/accept-invite/inv_expired');
      expect(redirect).toContain('token=tok_e2e_guest');
      await expectLoginFormReady(page);
    });

    test('unauthorized page renders without auth', async ({ page }) => {
      await gotoApp(page, '/unauthorized');
      await expect(page.getByTestId('unauthorized-page')).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('heading', { name: /^403$/ })).toBeVisible();
    });

    test('the document title is composed from the route manifest', async ({ page }) => {
      await gotoApp(page, '/login');
      await expectAuthScreenReady(page);
      // manifestHead → "<title> · <product>" (RouteAnnouncer reads the same title).
      await expect(page).toHaveTitle(new RegExp(`· ${APP_TITLE}$`));
    });

    test('OAuth callback with an error query returns to login', async ({ page }) => {
      await gotoApp(page, '/callback/google?error=access_denied');
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
      await expectLoginFormReady(page);
    });
  });

  test.describe('auth guards', () => {
    const protectedPaths = ['/', '/dashboard', '/onboarding', '/organization'] as const;

    for (const path of protectedPaths) {
      test(`${path} redirects unauthenticated visitors to login`, async ({ page }) => {
        await gotoApp(page, path);
        await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
        await expectLoginFormReady(page);
      });
    }

    test('unknown path shows 404 without requiring auth', async ({ page }) => {
      await gotoApp(page, '/route-integration-missing-page');
      await expect(page.getByTestId('not-found-page')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('authenticated journey', () => {
    test.beforeEach(async () => {
      test.skip(
        !(await verifyDatabaseConnection()),
        'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
      );
    });

    test('email-code sign-in lands on dashboard with app shell', async ({ page }) => {
      await registerNewUserAndGoToDashboard(page);
      await expectAppHeaderReady(page);
      await expect(page.getByTestId('app-layout')).toBeVisible();
    });

    test('root resolver and personal dashboard route both serve the dashboard shell', async ({
      page,
    }) => {
      await registerNewUserAndGoToDashboard(page);

      await navigateAuthenticated(page, '/');
      await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

      await navigateAuthenticated(page, '/dashboard');
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('organization picker redirects personal workspace users to dashboard', async ({
      page,
    }) => {
      await registerNewUserAndGoToDashboard(page);
      await navigateAuthenticated(page, '/organization');
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('settings hash modal opens over org dashboard and closes with Escape', async ({
      page,
    }) => {
      await registerNewUserAndGoToDashboard(page);
      await openSettingsHash(page, 'account', 'profile');

      await expect(page.getByTestId('settings-modal')).toBeVisible();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('settings-modal')).not.toBeVisible();
    });

    test('onboarding is skipped once the user is provisioned', async ({ page }) => {
      await registerNewUserAndGoToDashboard(page);
      await navigateAuthenticated(page, '/onboarding');
      await expect(page).not.toHaveURL(/\/onboarding/, { timeout: 10000 });
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('404 while authenticated still renders not-found', async ({ page }) => {
      await registerNewUserAndGoToDashboard(page);
      await navigateAuthenticated(page, '/authenticated-missing-route');
      await expect(page.getByTestId('not-found-page')).toBeVisible({ timeout: 5000 });
    });

    test('API session hydrate via refresh cookie resolves `/` to dashboard', async ({
      page,
    }) => {
      await authenticateViaEmailCodeAndLand(page);
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('logout returns to login', async ({ page }) => {
      await registerNewUserAndGoToDashboard(page);
      await page.getByTestId('user-menu-trigger').click();
      await clickTestId(page, 'logout-button');
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
      await expectLoginFormReady(page);
    });

    test('after logout the session is torn down and protected routes re-guard', async ({
      page,
    }) => {
      await registerNewUserAndGoToDashboard(page);
      await page.getByTestId('user-menu-trigger').click();
      await clickTestId(page, 'logout-button');
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

      // A full reload proves the session is truly gone (in-memory token cleared
      // and the refresh cookie revoked) — the guard sends us back to login.
      await gotoApp(page, '/dashboard');
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
      await expectLoginFormReady(page);
    });
  });
});
