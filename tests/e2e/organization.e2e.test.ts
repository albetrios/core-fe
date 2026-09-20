import { expect, test } from '@playwright/test';

import {
  createTeamOrgViaSwitcher,
  registerNewUserAndGoToDashboard,
} from '@/tests/utils/e2e-auth.ts';
import { byTestId, gotoApp, navigateAuthenticated } from '@/tests/utils/e2e-hybrid.ts';

test.describe('Organization picker', () => {
  test('redirects unauthenticated visitors to login', async ({ page }) => {
    await gotoApp(page, '/organization');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('redirects provisioned personal users to dashboard', async ({ page }) => {
    await registerNewUserAndGoToDashboard(page);
    await navigateAuthenticated(page, '/organization');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('the switcher opens an accessible menu and closes on Escape', async ({ page }) => {
    await registerNewUserAndGoToDashboard(page);
    const trigger = byTestId(page, 'organization-switcher-trigger');
    test.skip(!(await trigger.isVisible().catch(() => false)), 'org switcher hidden');

    await trigger.click();
    // Radix DropdownMenuContent exposes role="menu".
    await expect(page.getByRole('menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
  });

  test('the create-organization action opens the create dialog', async ({ page }) => {
    await registerNewUserAndGoToDashboard(page);
    const trigger = byTestId(page, 'organization-switcher-trigger');
    test.skip(!(await trigger.isVisible().catch(() => false)), 'org switcher hidden');

    await trigger.click();
    const createItem = page.getByTestId('organization-switcher-create');
    test.skip(
      !(await createItem.isVisible().catch(() => false)),
      'team creation disabled in this deployment mode',
    );

    await createItem.click();
    await expect(page.getByTestId('create-organization-dialog-form')).toBeVisible();
    await expect(page.getByTestId('create-organization-dialog-name')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /create organization/i }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('create-organization-dialog-form')).toBeHidden();
  });

  test('organization switcher lists team org after create', async ({ page }) => {
    await registerNewUserAndGoToDashboard(page);
    const switcher = byTestId(page, 'organization-switcher-trigger');
    test.skip(!(await switcher.isVisible().catch(() => false)), 'org switcher hidden');
    const { slug } = await createTeamOrgViaSwitcher(page);
    await byTestId(page, 'organization-switcher-trigger').click();
    await expect(page.getByTestId(`organization-switcher-option-${slug}`)).toBeVisible({
      timeout: 10000,
    });
    await page.keyboard.press('Escape');
  });
});
