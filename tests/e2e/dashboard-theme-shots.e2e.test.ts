import { expect, type Page, test } from '@playwright/test';

import { navigateInApp } from '@/tests/utils/e2e-auth.ts';
import { uniqueE2eEmail } from '@/tests/utils/e2e-faker.ts';
import {
  e2eAuthHeaders,
  pollVerificationCodeFromMailOutbox,
} from '@/tests/utils/e2e-session.ts';

/**
 * TEMP capture spec (not part of the suite's assertions): renders the
 * dashboard under named colour presets, dark mode, and random shuffles and
 * saves screenshots for design review. Delete freely.
 */
const SHOT_DIR = 'test-results/theme-shots';

type P = Page;

async function openAppearance(page: P) {
  await page.getByTestId('floating-settings').click();
  await expect(page.getByTestId('appearance-panel')).toBeVisible();
}

async function clickInPanel(page: P, testId: string) {
  const el = page.getByTestId(testId);
  await el.scrollIntoViewIfNeeded();
  await el.click();
}

async function closePanel(page: P) {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
}

async function shoot(page: P, name: string) {
  await page.waitForTimeout(1600);
  await page.getByTestId('dashboard-page').screenshot({ path: `${SHOT_DIR}/${name}` });
}

test('capture dashboard colour presets and random shuffles', async ({ page }) => {
  test.setTimeout(300_000);

  const email = uniqueE2eEmail('theme-shots');
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
  await page.setViewportSize({ width: 1440, height: 5200 });

  // 1 — Violet preset on Classic.
  await openAppearance(page);
  await clickInPanel(page, 'named-preset-violet');
  await clickInPanel(page, 'dashboard-variant-classic');
  await closePanel(page);
  await shoot(page, '1-violet-classic.png');

  // 2 — Emerald preset on Command center.
  await openAppearance(page);
  await clickInPanel(page, 'named-preset-emerald');
  await clickInPanel(page, 'dashboard-variant-command');
  await closePanel(page);
  await shoot(page, '2-emerald-command.png');

  // 3 — Rose preset on Pulse.
  await openAppearance(page);
  await clickInPanel(page, 'named-preset-rose');
  await clickInPanel(page, 'dashboard-variant-pulse');
  await closePanel(page);
  await shoot(page, '3-rose-pulse.png');

  // 4 — Ocean preset on Bento.
  await openAppearance(page);
  await clickInPanel(page, 'named-preset-ocean');
  await clickInPanel(page, 'dashboard-variant-bento');
  await closePanel(page);
  await shoot(page, '4-ocean-bento.png');

  // 5 — Dark mode, Violet, Command center.
  await openAppearance(page);
  await clickInPanel(page, 'theme-dark');
  await clickInPanel(page, 'named-preset-violet');
  await clickInPanel(page, 'dashboard-variant-command');
  await closePanel(page);
  await shoot(page, '5-dark-violet-command.png');

  // 6 & 7 — random Shuffle presses (dark stays on: dramatic random looks).
  await page.getByTestId('dashboard-theme-shuffle').click();
  await shoot(page, '6-random-shuffle-a.png');
  await page.getByTestId('dashboard-theme-shuffle').click();
  await shoot(page, '7-random-shuffle-b.png');
});

declare global {
  var __coreFeEstablishSession: ((accessToken: string) => Promise<void>) | undefined;
}
