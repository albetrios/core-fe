import { expect, test } from '@playwright/test';

import { uniqueE2eEmail } from '@/tests/utils/e2e-faker.ts';
import {
  clickTestId,
  expectLoginFormReady,
  fillTestId,
} from '@/tests/utils/e2e-hybrid.ts';

/**
 * Network-fault resilience — connectivity loss surfaces the global
 * OfflineIndicator (and recovers), and a failing /version.json poll endpoint
 * never takes the app down. No API server required.
 */
test.describe('Network resilience', () => {
  test('offline banner appears on connectivity loss and clears on recovery', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    await expectLoginFormReady(page);
    await expect(page.getByTestId('offline-indicator')).toHaveCount(0);

    await context.setOffline(true);
    await expect(page.getByTestId('offline-indicator')).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByTestId('offline-indicator')).toHaveCount(0);
  });

  test('app boots and stays interactive when /version.json is unreachable', async ({
    page,
  }) => {
    // Kill the new-deployment poll target before the app ever loads.
    await page.route('**/version.json', (route) => route.abort());

    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.goto('/login');
    await expectLoginFormReady(page);

    // Hybrid: fill via testid; assert value via label (a11y path still works).
    const email = uniqueE2eEmail('network');
    await fillTestId(page, 'auth-email', email);
    await expect(page.getByLabel(/^email$/i)).toHaveValue(email);

    expect(
      pageErrors,
      `uncaught page errors: ${pageErrors.map((e) => e.message).join(', ')}`,
    ).toHaveLength(0);
  });

  test('a 500 from send-code does not crash the app or falsely advance the flow', async ({
    page,
  }) => {
    // Force the sign-in request to fail server-side, before the app loads.
    await page.route('**/auth/email/send-code', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { type: 'request_error', code: 'server_error', detail: 'boom' },
          meta: { request_id: 'e2e-500' },
        }),
      }),
    );
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.goto('/login');
    await expectLoginFormReady(page);
    await fillTestId(page, 'auth-email', uniqueE2eEmail('resilience'));
    await clickTestId(page, 'auth-email-submit');

    // A server error must NOT advance to the verification step, and the form
    // stays interactive — no white screen, no uncaught error.
    await expect(page.getByTestId('auth-email-verify-panel')).toBeHidden();
    await expect(page.getByTestId('auth-email')).toBeVisible();
    expect(
      pageErrors,
      `uncaught page errors: ${pageErrors.map((e) => e.message).join(', ')}`,
    ).toHaveLength(0);
  });

  test('a 429 from send-code surfaces feedback instead of hanging the form', async ({
    page,
  }) => {
    // Rate-limit the sign-in request unconditionally — even the client's single
    // honored-Retry-After retry lands on another 429, so the error must surface.
    await page.route('**/auth/email/send-code', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'retry-after': '1' },
        body: JSON.stringify({
          error: {
            type: 'rate_limit_error',
            code: 'rate_limited',
            detail: 'Too many requests',
          },
          meta: { request_id: 'e2e-429' },
        }),
      }),
    );
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.goto('/login');
    await expectLoginFormReady(page);
    await fillTestId(page, 'auth-email', uniqueE2eEmail('rate-limited'));
    await clickTestId(page, 'auth-email-submit');

    // The flow must not falsely advance, and the user must SEE the failure —
    // a silent spinner on persistent 429s is the bug this test pins down.
    await expect(page.getByTestId('auth-email-error-banner')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('auth-email-verify-panel')).toBeHidden();

    // The form stays interactive for a later retry once the window passes.
    await expect(page.getByTestId('auth-email')).toBeEnabled();
    expect(
      pageErrors,
      `uncaught page errors: ${pageErrors.map((e) => e.message).join(', ')}`,
    ).toHaveLength(0);
  });

  test('the offline indicator survives rapid connectivity flapping', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    await expectLoginFormReady(page);

    for (let cycle = 0; cycle < 2; cycle += 1) {
      await context.setOffline(true);
      await expect(page.getByTestId('offline-indicator')).toBeVisible();
      await context.setOffline(false);
      await expect(page.getByTestId('offline-indicator')).toHaveCount(0);
    }
  });
});
