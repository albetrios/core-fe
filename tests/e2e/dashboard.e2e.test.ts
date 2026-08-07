import { expect, test } from '@playwright/test';

import { registerNewUserAndGoToDashboard } from '@/tests/utils/e2e-auth.ts';
import { expectAppHeaderReady } from '@/tests/utils/e2e-hybrid.ts';

// The dashboard module is a placeholder until it is rebuilt after auth
// (REPLACE_WITH_MODULE) — these specs cover the shell + placeholder only.
test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await registerNewUserAndGoToDashboard(page);
  });

  test('displays the placeholder page', async ({ page }) => {
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('dashboard-greeting')).toBeVisible();
  });

  test('header elements are visible (hybrid)', async ({ page }) => {
    await expectAppHeaderReady(page);
  });

  test('sidebar navigation is visible', async ({ page }) => {
    await expect(page.getByTestId('sidebar')).toBeVisible();
  });

  test('the sidebar Settings quick-link opens the settings modal over the dashboard', async ({
    page,
  }) => {
    await page.getByTestId('sidebar-settings').click();
    await expect(page.getByTestId('settings-modal')).toBeVisible();
    await expect(page).toHaveURL(/#settings\/account\/profile$/);
    // Dashboard stays mounted behind the modal.
    await expect(page.getByTestId('dashboard-page')).toBeAttached();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-modal')).not.toBeVisible();
    await expect(page).not.toHaveURL(/#settings/);
  });

  test('the user menu exposes Settings and Logout actions', async ({ page }) => {
    await page.getByTestId('user-menu-trigger').click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByTestId('user-menu-settings')).toBeVisible();
    await expect(page.getByTestId('logout-button')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
  });
});

/**
 * Console hygiene — kept out of the main describe so the listener is attached
 * before the dashboard ever mounts (its beforeEach navigation happens first, and
 * a hard reload drops the in-memory access token).
 */
test.describe('Dashboard console hygiene', () => {
  test('mounts without React state-update warnings', async ({ page }) => {
    // Broad canary for render-phase state updates on the dashboard. Note this is
    // NOT a reliable reproduction of CORE-FE-T (an Anime.js frame landing mid-render
    // of CartesianGrid): that interleaving is a race and does not fire every visit —
    // verified by reverting the fix and watching this still pass. The real guard is
    // the unit test asserting the count-up never re-renders at all
    // (src/lib/animations/useAnimeCountUp.test.ts). This catches the wider class.
    const reactWarnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() !== 'error' && message.type() !== 'warning') return;
      const text = message.text();
      if (/Cannot update a component|setState.*while rendering/i.test(text)) {
        reactWarnings.push(text.slice(0, 200));
      }
    });

    await registerNewUserAndGoToDashboard(page);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    // Let the count-up tween finish (720ms) and the charts paint.
    await page.waitForTimeout(2000);

    expect(reactWarnings).toEqual([]);
  });
});
