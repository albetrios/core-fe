import { expect, test } from '@playwright/test';

import {
  authenticateViaEmailCodeAndLand,
  registerNewUserAndGoToDashboard,
} from '@/tests/utils/e2e-auth.ts';
import { openSettingsHash } from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * Account settings + header UX for a signed-in (personal) account: profile edit
 * with its confirm dialog, the sessions and notifications sections, the
 * danger-zone delete confirmation, and the notification center popover. These
 * are personal-account surfaces, so a plain registration is enough.
 */

test.describe('Account settings', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (mail_outbox)',
    );
    await registerNewUserAndGoToDashboard(page);
  });

  test('profile section renders the form and saves through the confirm dialog', async ({
    page,
  }) => {
    await openSettingsHash(page, 'account', 'profile');
    await expect(page.getByTestId('settings-section-profile')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('profile-form')).toBeVisible();
    // a11y guard: the name field is labelled.
    await expect(page.getByLabel('Name')).toBeVisible();

    // Editing makes the form dirty; submit opens the confirm dialog.
    await page.getByTestId('profile-name').fill('Ada Lovelace');
    await page.getByTestId('profile-submit').click();
    await expect(page.getByTestId('profile-confirm-save')).toBeVisible();

    await page.getByTestId('profile-confirm-save').click();
    // Dialog closes and the form remains usable (no crash).
    await expect(page.getByTestId('profile-confirm-save')).toHaveCount(0);
    await expect(page.getByTestId('profile-form')).toBeVisible();
  });

  test('profile edit can be cancelled at the confirm step', async ({ page }) => {
    await openSettingsHash(page, 'account', 'profile');
    await expect(page.getByTestId('profile-form')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('profile-name').fill('Temporary Name');
    await page.getByTestId('profile-submit').click();
    await expect(page.getByTestId('profile-confirm-cancel')).toBeVisible();

    await page.getByTestId('profile-confirm-cancel').click();
    await expect(page.getByTestId('profile-confirm-cancel')).toHaveCount(0);
  });

  test('sessions section renders the active-session surface', async ({ page }) => {
    await openSettingsHash(page, 'account', 'sessions');
    await expect(page.getByTestId('settings-account-sessions')).toBeVisible({
      timeout: 15000,
    });
  });

  test('notifications section renders the delivery preferences', async ({ page }) => {
    await openSettingsHash(page, 'account', 'notifications');
    await expect(page.getByTestId('settings-section-notifications')).toBeVisible({
      timeout: 15000,
    });
  });

  test('danger zone opens the delete-account confirmation and can cancel it', async ({
    page,
  }) => {
    await openSettingsHash(page, 'account', 'account');
    await expect(page.getByTestId('settings-section-account')).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByTestId('account-delete')).toBeVisible();
    await page.getByTestId('account-delete').click();
    await expect(page.getByTestId('account-delete-confirm')).toBeVisible();

    // Cancel — never actually delete in an E2E run.
    await page.getByTestId('account-delete-cancel').click();
    await expect(page.getByTestId('account-delete-confirm')).toHaveCount(0);
  });

  test('the notification bell opens the notification center', async ({ page }) => {
    // a11y guard: the bell is a labelled control.
    await expect(page.getByTestId('notification-bell')).toBeVisible();
    await page.getByTestId('notification-bell').click();
    // The center opens; a fresh account shows the empty inbox state inside it.
    await expect(page.getByTestId('notification-popover')).toBeVisible();
  });

  test('profile submit is disabled on a pristine form and enables after an edit', async ({
    page,
  }) => {
    await openSettingsHash(page, 'account', 'profile');
    await expect(page.getByTestId('profile-form')).toBeVisible({ timeout: 15000 });

    // No changes yet → the save button is gated by isDirty.
    await expect(page.getByTestId('profile-submit')).toBeDisabled();
    await page.getByTestId('profile-name').fill('Grace Hopper E2E');
    await expect(page.getByTestId('profile-submit')).toBeEnabled();
  });

  test('editing profile opens an accessible save-confirmation alertdialog', async ({
    page,
  }) => {
    await openSettingsHash(page, 'account', 'profile');
    await expect(page.getByTestId('profile-form')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('profile-name').fill('Katherine Johnson');
    await page.getByTestId('profile-submit').click();

    // The confirm step is a proper alertdialog exposing both actions (a11y guard).
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('profile-confirm-save')).toBeVisible();
    await expect(page.getByTestId('profile-confirm-cancel')).toBeVisible();

    // Escape dismisses the confirmation without committing the edit.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('the notification center closes on Escape', async ({ page }) => {
    await page.getByTestId('notification-bell').click();
    await expect(page.getByTestId('notification-popover')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('notification-popover')).not.toBeVisible();
  });
});

/**
 * QA-6 reported the Profile Email field as "disabled but empty". It is not: the
 * address is there, it survives a reload, and — unlike the fields beside it —
 * it is readable from the DOM `value` ATTRIBUTE as well as the property.
 *
 * That distinction is the whole point of the second half of this test. The
 * editable fields are `register()`-ed, so React never writes their attribute
 * and `getAttribute('value')` is `null` for text a user can plainly see; the
 * Email field is controlled, so its attribute is written. An inspector that
 * reads attributes therefore reports the editable fields as empty and the Email
 * field as filled — the exact opposite of the report, and the same measurement
 * trap that produced QA-1.
 */
test.describe('Account settings — profile identity', () => {
  test('the Profile Email shows the signed-in address, before and after a reload', async ({
    page,
  }) => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (mail_outbox)',
    );
    const { email } = await authenticateViaEmailCodeAndLand(page);

    await openSettingsHash(page, 'account', 'profile');
    await expect(page.getByTestId('profile-email')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('profile-email')).toHaveValue(email);
    await expect(page.getByTestId('profile-email')).toBeDisabled();

    // A cold boot rebuilds the session from the refresh cookie, which is the
    // path that has to re-supply the address rather than carrying it over.
    await page.reload();
    await expect(page.getByTestId('profile-email')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('profile-email')).toHaveValue(email);

    const readings = await page.evaluate(() => {
      const field = (id: string) =>
        document.querySelector<HTMLInputElement>(`[data-testid="${id}"]`);
      return {
        emailAttribute: field('profile-email')?.getAttribute('value') ?? null,
        nameAttribute: field('profile-name')?.getAttribute('value') ?? null,
        nameProperty: field('profile-name')?.value ?? null,
      };
    });
    expect(readings.emailAttribute).toBe(email);
    // The trap, pinned: the Name field carries text with no `value` attribute.
    expect(readings.nameAttribute).toBeNull();
    expect(readings.nameProperty).not.toBe('');
  });
});
