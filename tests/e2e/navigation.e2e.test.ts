import { expect, test } from '@playwright/test';

import { expectLoginFormReady } from '@/tests/utils/e2e-hybrid.ts';

test.describe('Navigation', () => {
  test('unknown routes show 404 page', async ({ page }) => {
    await page.goto('/some-nonexistent-page');
    await expect(page.getByTestId('not-found-page')).toBeVisible({ timeout: 5000 });
  });

  test('protected routes redirect to login when unauthenticated', async ({ page }) => {
    for (const path of ['/', '/dashboard', '/onboarding', '/organization'] as const) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
      await expectLoginFormReady(page);
    }
  });

  test('login page is accessible without auth', async ({ page }) => {
    await page.goto('/login');
    await expectLoginFormReady(page);
  });

  test('MFA page is accessible without auth', async ({ page }) => {
    await page.goto('/mfa');
    await expect(page.getByTestId('mfa-page')).toBeVisible();
  });

  test('unauthorized page is accessible without auth', async ({ page }) => {
    await page.goto('/unauthorized');
    await expect(page.getByTestId('unauthorized-page')).toBeVisible();
  });

  test('accept-invite requires a session — a guest is redirected with the link intact', async ({
    page,
  }) => {
    // Auth-required since INV-4 (`requireAuth` in `beforeLoad`). What must survive
    // the detour is the invite itself: path AND single-use token.
    await page.goto('/accept-invite/inv_expired?token=tok_e2e_guest');
    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 10000 });
    const redirect = new URL(page.url()).searchParams.get('redirect') ?? '';
    expect(redirect).toContain('/accept-invite/inv_expired');
    expect(redirect).toContain('token=tok_e2e_guest');
    await expectLoginFormReady(page);
  });

  test('protected route preserves the intended destination in the redirect param', async ({
    page,
  }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 5000 });
    // requireAuth(location.href) carries the original path so login can return there.
    expect(decodeURIComponent(new URL(page.url()).search)).toContain('onboarding');
    await expectLoginFormReady(page);
  });

  test('deeply nested unknown routes fall through to the 404 page', async ({ page }) => {
    await page.goto('/organization/acme/does/not/exist');
    await expect(page.getByTestId('not-found-page')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  });

  test('404 page offers a labelled way home that lands on login when unauthenticated', async ({
    page,
  }) => {
    await page.goto('/some-nonexistent-page');
    const goHome = page.getByRole('link', { name: 'Go Home' });
    await expect(goHome).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveTitle(/Page not found/);
    await goHome.click();
    // `/` resolves through the auth guard; a guest lands on login.
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    await expectLoginFormReady(page);
  });
});
