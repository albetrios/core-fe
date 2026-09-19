import { expect, test } from '@playwright/test';

import { gotoApp } from '@/tests/utils/e2e-hybrid.ts';

/**
 * OAuth callback landing (`/callback/$provider`) — the error paths. A real
 * provider round-trip needs live OAuth credentials, but every rejection path
 * is provider-independent: bad/missing params must land the visitor on /login
 * (never a dead spinner), and a signed-out silent-refresh fallback must fail
 * closed.
 */
test.describe('OAuth callback error handling', () => {
  test('a direct visit with no code/state falls back and lands on /login', async ({
    page,
  }) => {
    await gotoApp(page, '/callback/google');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('a provider denial (error param, no code) lands on /login', async ({ page }) => {
    await gotoApp(page, '/callback/google?error=access_denied');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('well-formed but forged code+state is rejected by the exchange → /login', async ({
    page,
  }) => {
    const forgedState = 'a'.repeat(64); // matches the 64-hex shape, minted by no one
    await gotoApp(page, `/callback/google?code=forged-code-123&state=${forgedState}`);
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test('an unknown provider slug never reaches the exchange', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await gotoApp(page, '/callback/not-a-provider?code=x&state=' + 'b'.repeat(64));
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    expect(
      pageErrors,
      `uncaught page errors: ${pageErrors.map((e) => e.message).join(', ')}`,
    ).toHaveLength(0);
  });
});
