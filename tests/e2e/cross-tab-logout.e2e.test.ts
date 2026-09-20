import { expect, test } from '@playwright/test';

import { registerNewUserAndGoToDashboard } from '@/tests/utils/e2e-auth.ts';
import { byTestId, clickTestId, expectAppHeaderReady } from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * Cross-tab session teardown (`shared/auth/auth-channel.ts`): logging out in one
 * tab must kill every other open tab of the same session via BroadcastChannel.
 */
test.describe('Cross-tab logout', () => {
  test.beforeEach(async () => {
    expect(
      await verifyDatabaseConnection(),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    ).toBe(true);
  });

  test('logging out in tab A signs tab B out too', async ({ page, context }) => {
    test.setTimeout(120_000);
    await registerNewUserAndGoToDashboard(page);

    // Second tab of the same browser context shares the session.
    const tabB = await context.newPage();
    const authResponses: { path: string; status: number }[] = [];
    tabB.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/api/v1/auth/')) {
        authResponses.push({ path, status: response.status() });
      }
    });
    await tabB.goto(page.url());
    // Wait for tab B's app to boot and settle on a signed-in surface — the
    // guards would bounce a dead session to /login. The subject here is the
    // broadcast teardown, not which page the fresh tab lands on.
    await expect(byTestId(tabB, 'user-menu-trigger'))
      .toBeVisible({
        timeout: 30_000,
      })
      .finally(async () => {
        await test.info().attach('fresh-tab-auth-statuses', {
          body: JSON.stringify(authResponses),
          contentType: 'application/json',
        });
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
