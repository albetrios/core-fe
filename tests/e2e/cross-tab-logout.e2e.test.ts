import { expect, test } from '@playwright/test';

import { registerNewUserAndGoToDashboard } from '@/tests/utils/e2e-auth.ts';
import { clickTestId, expectAppHeaderReady } from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * Cross-tab session teardown (`shared/auth/auth-channel.ts`): logging out in one
 * tab must kill every other open tab of the same session via BroadcastChannel.
 */
test.describe('Cross-tab logout', () => {
  test.beforeEach(async () => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    );
  });

  test('logging out in tab A signs tab B out too', async ({ page, context }) => {
    // KNOWN REGRESSION: a fresh tab's cookie-refresh boot hits the same
    // double-refresh CSRF race as an authenticated reload (second /auth/refresh
    // 403s and force-logs out), so tab B never reaches a signed-in surface.
    // Re-enable once the boot refresh is truly single-flight.
    test.fixme(
      true,
      'fresh-tab session boot bounces to /login (double-refresh CSRF race)',
    );
    test.setTimeout(120_000);
    await registerNewUserAndGoToDashboard(page);

    // Second tab of the same browser context shares the session.
    const tabB = await context.newPage();
    await tabB.goto(page.url());
    // Wait for tab B's app to boot and settle on a signed-in surface — the
    // guards would bounce a dead session to /login. The subject here is the
    // broadcast teardown, not which page the fresh tab lands on.
    await tabB.waitForLoadState('networkidle');
    await expect(tabB.getByTestId('user-menu-trigger').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(tabB).not.toHaveURL(/\/login/);

    await expectAppHeaderReady(page);
    await clickTestId(page, 'user-menu-trigger');
    await clickTestId(page, 'logout-button');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    // The broadcast must tear tab B down without any interaction there.
    await expect(tabB).toHaveURL(/\/login/, { timeout: 15_000 });
    await tabB.close();
  });
});
