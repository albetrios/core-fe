import { expect, test } from '@playwright/test';

import { registerNewUserAndGoToDashboard } from '@/tests/utils/e2e-auth.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * Seeded-inbox assertions still require core-be test fixtures
 * (`GET /me/notifications`) — that suite stays skipped below. The empty-inbox
 * and navigation behavior needs no fixtures, so it runs against a fresh account.
 */
test.describe.skip('Notifications (seeded)', () => {
  test('shows seeded notifications', () => {
    /* Pending core-be test fixtures (GET /me/notifications). */
  });
});

test.describe('Notification center (empty inbox)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (mail_outbox)',
    );
    await registerNewUserAndGoToDashboard(page);
  });

  test('a fresh account shows the empty-inbox state with mark-all hidden', async ({
    page,
  }) => {
    // No unread items → the header badge is absent.
    await expect(page.getByTestId('notification-badge')).toHaveCount(0);

    await page.getByTestId('notification-bell').click();
    await expect(page.getByTestId('notification-popover')).toBeVisible();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    // MarkAllReadButton renders null when the inbox is empty (hidden entirely,
    // not merely disabled) — assert absence to match that contract.
    await expect(page.getByTestId('notification-mark-all')).toHaveCount(0);
    // The settings-link footer only renders when there ARE items, so it is
    // absent on an empty inbox.
    await expect(page.getByTestId('notification-settings-link')).toHaveCount(0);
  });

  test('the empty notification center closes on Escape', async ({ page }) => {
    await page.getByTestId('notification-bell').click();
    await expect(page.getByTestId('notification-popover')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('notification-popover')).not.toBeVisible();
  });
});
