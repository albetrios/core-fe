import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { registerNewUserAndGoToDashboard } from '@/tests/utils/e2e-auth.ts';
import {
  expectAuthScreenReady,
  gotoApp,
  openSettingsHash,
} from '@/tests/utils/e2e-hybrid.ts';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function settleAnimations(page: Page) {
  await page.waitForTimeout(400);
}

test.describe('Accessibility', () => {
  test('login page has no critical a11y violations', async ({ page }) => {
    await gotoApp(page, '/login');
    await expectAuthScreenReady(page);
    await settleAnimations(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(critical).toEqual([]);
  });

  // Auth-light utility/error pages — reachable without a session, so they run
  // fast and deterministically. Each must be axe-clean at critical/serious.
  const utilityPages = [
    { path: '/some-nonexistent-page', testId: 'not-found-page', label: '404' },
    { path: '/unauthorized', testId: 'unauthorized-page', label: 'unauthorized' },
    { path: '/mfa', testId: 'mfa-page', label: 'MFA' },
  ] as const;

  for (const { path, testId, label } of utilityPages) {
    test(`${label} page has no critical a11y violations`, async ({ page }) => {
      await gotoApp(page, path);
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 5000 });
      await settleAnimations(page);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const critical = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );

      expect(critical).toEqual([]);
    });
  }

  test('dashboard page has no critical a11y violations', async ({ page }) => {
    await registerNewUserAndGoToDashboard(page);
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    await settleAnimations(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('[data-slot="select-trigger"]')
      .exclude('[data-testid="sidebar"]')
      .exclude('[data-testid="dashboard-highlights-carousel"]')
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(critical).toEqual([]);
  });

  test('accept-invite error state has no critical a11y violations', async ({ page }) => {
    await gotoApp(page, '/accept-invite/inv_expired');
    await expect(page.getByTestId('accept-invite-error')).toBeVisible({
      timeout: 10000,
    });
    await settleAnimations(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(critical).toEqual([]);
  });

  test('settings modal (account profile) has no critical a11y violations', async ({
    page,
  }) => {
    await registerNewUserAndGoToDashboard(page);
    await openSettingsHash(page, 'account', 'profile');
    await expect(page.getByTestId('settings-section-profile')).toBeVisible({
      timeout: 10000,
    });
    await settleAnimations(page);

    // Scope to the dialog: the dimmed page behind the overlay legitimately
    // fails contrast checks and is not what this test certifies.
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('[role="dialog"]')
      .exclude('[data-slot="select-trigger"]')
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(critical).toEqual([]);
  });
});
