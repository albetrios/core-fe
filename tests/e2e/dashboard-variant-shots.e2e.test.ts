import { expect, type Page, test } from '@playwright/test';

import { navigateInApp } from '@/tests/utils/e2e-auth.ts';
import { uniqueE2eEmail } from '@/tests/utils/e2e-faker.ts';
import {
  e2eAuthHeaders,
  pollVerificationCodeFromMailOutbox,
} from '@/tests/utils/e2e-session.ts';

/**
 * TEMP capture spec (not part of the suite's assertions): renders each
 * dashboard arrangement variant through the Appearance picker and saves
 * full-page screenshots for design review. Delete freely.
 */
const SHOT_DIR = 'test-results/variant-shots';

async function pickVariant(page: Page, id: string) {
  await page.getByTestId('floating-settings').click();
  const option = page.getByTestId(`dashboard-variant-${id}`);
  await option.scrollIntoViewIfNeeded();
  await option.click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
}

test('capture dashboard arrangement variants', async ({ page }) => {
  test.setTimeout(240_000);

  // API-minted session (send-code → mail-outbox code → login → onboarding
  // complete), then the dev-only hook hands the token to the SPA — no wizard.
  const email = uniqueE2eEmail('shots');
  const send = await page.request.post('/api/v1/auth/email/send-code', {
    data: { email },
    headers: e2eAuthHeaders(),
  });
  expect(send.ok(), `send-code: ${send.status()}`).toBeTruthy();
  const code = await pollVerificationCodeFromMailOutbox(email);
  const login = await page.request.post('/api/v1/auth/email/login', {
    data: { email, code },
    headers: e2eAuthHeaders(),
  });
  expect(login.ok(), `login: ${login.status()}`).toBeTruthy();
  const body = (await login.json()) as { data: { access_token: string } };
  const token = body.data.access_token;
  const complete = await page.request.post('/api/v1/users/me/onboarding/complete', {
    headers: { ...e2eAuthHeaders(), Authorization: `Bearer ${token}` },
  });
  expect(complete.ok(), `onboarding: ${complete.status()}`).toBeTruthy();

  await page.goto('/login');
  await page.waitForFunction(() => globalThis.__coreFeEstablishSession != null, null, {
    timeout: 15_000,
  });
  await page.evaluate(async (accessToken) => {
    await globalThis.__coreFeEstablishSession?.(accessToken);
  }, token);
  await navigateInApp(page, '/');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('dashboard-greeting')).toBeVisible({ timeout: 20_000 });
  // Tall viewport: the shell scrolls an inner container, so off-screen content
  // never paints — size the window to fit the whole dashboard instead.
  await page.setViewportSize({ width: 1440, height: 5200 });

  await pickVariant(page, 'classic');
  await page.waitForTimeout(1500);
  await page
    .getByTestId('dashboard-page')
    .screenshot({ path: `${SHOT_DIR}/1-classic.png` });

  await pickVariant(page, 'command');
  await expect(page.getByTestId('dashboard-pulse-gauge')).toBeVisible();
  await page.waitForTimeout(1500);
  await page
    .getByTestId('dashboard-page')
    .screenshot({ path: `${SHOT_DIR}/2-command-center.png` });

  await pickVariant(page, 'pulse');
  await expect(page.getByTestId('dashboard-pulse-gauge')).toBeVisible();
  await page.waitForTimeout(1500);
  await page
    .getByTestId('dashboard-page')
    .screenshot({ path: `${SHOT_DIR}/3-pulse.png` });

  await pickVariant(page, 'bento');
  await expect(page.getByTestId('dashboard-trend-strip')).toBeVisible();
  await page.waitForTimeout(1500);
  await page
    .getByTestId('dashboard-page')
    .screenshot({ path: `${SHOT_DIR}/4-bento.png` });

  // One global Shuffle from the dashboard theme strip: arrangement + palette +
  // fonts all re-roll together.
  await page.getByTestId('dashboard-theme-shuffle').click();
  await page.waitForTimeout(1800);
  await page
    .getByTestId('dashboard-page')
    .screenshot({ path: `${SHOT_DIR}/5-after-shuffle.png` });
});

declare global {
  var __coreFeEstablishSession: ((accessToken: string) => Promise<void>) | undefined;
}
