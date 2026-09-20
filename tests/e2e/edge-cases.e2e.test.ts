import { expect, test } from '@playwright/test';

import {
  createTeamOrgViaSwitcher,
  registerNewUserAndGoToDashboard,
} from '@/tests/utils/e2e-auth.ts';
import { uniqueE2eEmail } from '@/tests/utils/e2e-faker.ts';
import {
  byTestId,
  clickTestId,
  fillTestId,
  gotoApp,
  navigateAuthenticated,
  openSettingsHash,
  submitAuthEmailForCode,
} from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * Cross-cutting UI edge cases — hash routing, auth validation, Stripe return cleanup,
 * and modal behavior on atypical navigation paths.
 */
test.describe('Edge cases — settings hash modal', () => {
  test.beforeEach(async () => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    );
  });

  test('invalid section hash canonicalizes to account profile', async ({ page }) => {
    await registerNewUserAndGoToDashboard(page);
    await page.evaluate(() => {
      window.location.hash = '#settings/account/not-a-real-section';
    });
    await expect(page.getByTestId('settings-modal')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('settings-section-profile')).toBeVisible({
      timeout: 10000,
    });
    await expect(page).toHaveURL(/#settings\/account\/profile$/);
  });

  test('legacy organization billing hash opens account billing panel', async ({
    page,
  }) => {
    await registerNewUserAndGoToDashboard(page);
    await page.evaluate(() => {
      window.location.hash = '#settings/organization/billing';
    });
    await expect(page.getByTestId('settings-modal')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('settings-account-billing')).toBeVisible({
      timeout: 15000,
    });
    await expect(page).toHaveURL(/#settings\/account\/billing$/);
  });

  test('organization members hash on personal workspace falls back to profile', async ({
    page,
  }) => {
    await registerNewUserAndGoToDashboard(page);
    await page.evaluate(() => {
      window.location.hash = '#settings/organization/members';
    });
    await expect(page.getByTestId('settings-modal')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('settings-section-profile')).toBeVisible({
      timeout: 10000,
    });
  });

  test('settings deep link overlays a 404 page without losing the route', async ({
    page,
  }) => {
    await registerNewUserAndGoToDashboard(page);
    await navigateAuthenticated(page, '/this-page-does-not-exist-e2e');
    await expect(page.getByTestId('not-found-page')).toBeVisible({ timeout: 10000 });

    await openSettingsHash(page, 'account', 'security');
    await expect(page.getByTestId('settings-modal')).toBeVisible();
    await expect(page.getByTestId('settings-section-security')).toBeVisible({
      timeout: 10000,
    });
    await expect(page).toHaveURL(/this-page-does-not-exist-e2e/);
    await expect(page.getByTestId('not-found-page')).toBeAttached();
  });

  test('unauthenticated settings hash does not mount the modal on login', async ({
    page,
  }) => {
    await gotoApp(page, '/login#settings/account/profile');
    await expect(page.getByTestId('login-page')).toBeVisible();
    await expect(page.getByTestId('settings-modal')).not.toBeVisible();
  });

  test('a non-settings hash (skip-link anchor) never mounts the modal', async ({
    page,
  }) => {
    await registerNewUserAndGoToDashboard(page);
    await page.evaluate(() => {
      window.location.hash = '#main-content';
    });
    // parseSettingsHash returns null for non-settings hashes → modal stays closed.
    await expect(page.getByTestId('settings-modal')).not.toBeVisible();
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('switching section via the hash swaps the panel in place (single modal)', async ({
    page,
  }) => {
    await registerNewUserAndGoToDashboard(page);
    await openSettingsHash(page, 'account', 'profile');
    await expect(page.getByTestId('settings-section-profile')).toBeVisible({
      timeout: 10000,
    });

    await page.evaluate(() => {
      window.location.hash = '#settings/account/security';
    });
    await expect(page.getByTestId('settings-section-security')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('settings-section-profile')).toBeHidden();
    // The modal is swapped in place, not stacked.
    await expect(page.getByTestId('settings-modal')).toHaveCount(1);
  });

  test('Escape closes the 404-overlaid settings modal and keeps the 404 page', async ({
    page,
  }) => {
    await registerNewUserAndGoToDashboard(page);
    await navigateAuthenticated(page, '/this-page-does-not-exist-e2e-2');
    await expect(page.getByTestId('not-found-page')).toBeVisible({ timeout: 10000 });

    await openSettingsHash(page, 'account', 'security');
    await expect(page.getByTestId('settings-modal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-modal')).not.toBeVisible();
    // The underlying 404 route is preserved; only the hash overlay is dismissed.
    await expect(page.getByTestId('not-found-page')).toBeVisible();
    await expect(page).not.toHaveURL(/#settings/);
  });
});

test.describe('Edge cases — auth email flow', () => {
  test('malformed email is blocked before send-code (native or inline validation)', async ({
    page,
  }) => {
    let sendCodeCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('/auth/email/send-code') && req.method() === 'POST') {
        sendCodeCalls += 1;
      }
    });

    await gotoApp(page, '/login');
    await fillTestId(page, 'auth-email', 'not-an-email');
    await clickTestId(page, 'auth-email-submit');

    const nativeMessage = await page
      .getByTestId('auth-email')
      .evaluate((el) => (el as HTMLInputElement).validationMessage);
    const inlineErrorVisible = await page.getByTestId('auth-email-error').isVisible();

    expect(nativeMessage.length > 0 || inlineErrorVisible).toBe(true);
    await expect(page.getByTestId('auth-email-verify-panel')).not.toBeVisible();
    expect(sendCodeCalls).toBe(0);
  });

  test('change email returns from verification step to the email panel', async ({
    page,
  }) => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    );

    const email = uniqueE2eEmail('change-email');
    await gotoApp(page, '/login');
    await submitAuthEmailForCode(page, email);
    await expect(page.getByTestId('auth-email-verify-panel')).toBeVisible();

    await clickTestId(page, 'auth-email-change');
    await expect(page.getByTestId('auth-email-panel')).toBeVisible();
    await expect(page.getByTestId('auth-email-verify-panel')).not.toBeVisible();
    await expect(page.getByTestId('auth-email')).toHaveValue(email);
  });
});

test.describe('Edge cases — billing Stripe return', () => {
  test.beforeEach(async () => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    );
  });

  test('succeeded Stripe return params are stripped from the URL on billing panel', async ({
    page,
  }) => {
    // Regression: clearing Stripe's params used `navigate({ to: '.', search,
    // replace })` with no `hash`, and the router resolves an omitted hash to
    // none — so it also cleared `#settings/account/billing` and the modal closed
    // under a customer who had just come back from 3DS. Nothing had ever run this
    // spec (it was skipping by accident), which is how that shipped. The last
    // assertion is the one that matters: the billing panel is still there.
    await registerNewUserAndGoToDashboard(page);
    const switcher = byTestId(page, 'organization-switcher-trigger');
    test.skip(!(await switcher.isVisible()), 'team billing requires switcher');
    await createTeamOrgViaSwitcher(page);

    // A Stripe return is a full page LOAD of `…?redirect_status=…#settings/…`,
    // so load it. The router is the source of truth for location
    // (`lib/billing/stripe-return.ts`): a raw `history.replaceState` plus a
    // synthetic `hashchange` opens the modal but leaves the router's cached
    // location without the hash, and the section falls back to Profile.
    const stripeReturn = new URL(page.url());
    stripeReturn.searchParams.set('redirect_status', 'succeeded');
    stripeReturn.searchParams.set('payment_intent_client_secret', 'pi_e2e_test_secret');
    stripeReturn.searchParams.set('setup_intent_client_secret', 'seti_e2e_test');
    stripeReturn.hash = '#settings/account/billing';
    await page.goto(stripeReturn.toString());

    await expect(page.getByTestId('settings-modal')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('settings-account-billing')).toBeVisible({
      timeout: 15000,
    });

    await expect
      .poll(
        () => {
          const url = new URL(page.url());
          return !(
            url.searchParams.has('redirect_status') ||
            url.searchParams.has('payment_intent_client_secret') ||
            url.searchParams.has('setup_intent_client_secret')
          );
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await expect(page).toHaveURL(/#settings\/account\/billing$/);
  });
});
