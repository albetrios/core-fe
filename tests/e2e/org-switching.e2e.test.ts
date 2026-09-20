import { expect, test } from '@playwright/test';

import {
  createTeamOrgViaSwitcher,
  registerNewUserAndGoToDashboard,
  selectOrganizationInSwitcher,
} from '@/tests/utils/e2e-auth.ts';
import { byTestId } from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * Dual-URL org switching: personal `/dashboard` ↔ team `/organization/$slug/dashboard`.
 * Requires live core-be, DATABASE_URL, and deployment flags that expose the switcher.
 */
test.describe('Organization switching (dual-URL)', () => {
  test.beforeEach(async () => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    );
  });

  test('switcher moves between personal dashboard and a new team org', async ({
    page,
  }) => {
    await registerNewUserAndGoToDashboard(page);

    const switcher = byTestId(page, 'organization-switcher-trigger');
    test.skip(
      !(await switcher.isVisible().catch(() => false)),
      'org switcher hidden for deployment mode',
    );

    const { slug: teamSlug } = await createTeamOrgViaSwitcher(page);
    await expect(page).toHaveURL(new RegExp(`/organization/${teamSlug}/dashboard`));

    await byTestId(page, 'organization-switcher-trigger').click();
    const personalOption = page.getByTestId('organization-switcher-option-personal');
    test.skip(
      !(await personalOption.isVisible().catch(() => false)),
      'personal org section disabled',
    );
    await page.keyboard.press('Escape');
    // Radix closes the menu with an exit animation. A trigger click that lands
    // mid-close is swallowed (the same trap `theme.e2e` documents), so wait for
    // the menu to be fully gone before the helper opens it again.
    await expect(personalOption).toBeHidden();

    await selectOrganizationInSwitcher(page, 'personal');
    await expect(page).toHaveURL(/\/dashboard(?:\?|$|#)/, { timeout: 15000 });
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    await selectOrganizationInSwitcher(page, teamSlug);
    await expect(page).toHaveURL(new RegExp(`/organization/${teamSlug}/dashboard`), {
      timeout: 15000,
    });
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });
});
