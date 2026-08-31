import { expect, type Page, test } from '@playwright/test';

import { navigateInApp } from '@/tests/utils/e2e-auth.ts';
import { uniqueE2eEmail } from '@/tests/utils/e2e-faker.ts';
import {
  e2eAuthHeaders,
  pollVerificationCodeFromMailOutbox,
} from '@/tests/utils/e2e-session.ts';

/**
 * TEMP capture spec (not part of the suite's assertions): the seven
 * preset/shuffle looks, photographed at mobile and tablet widths for design
 * review. Delete freely.
 */
const SHOT_DIR = 'test-results/theme-shots-small';

type P = Page;

async function openAppearance(page: P) {
  const customize = page.getByTestId('dashboard-theme-customize');
  await customize.scrollIntoViewIfNeeded();
  await customize.click();
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

async function closeSidebarOverlay(page: P) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width >= 768) return;
  const sidebar = page.getByTestId('sidebar');
  if (await sidebar.isVisible().catch(() => false)) {
    await page.mouse.click(viewport.width - 12, 200);
    await page.waitForTimeout(500);
  }
}

async function shoot(page: P, name: string) {
  await page.waitForTimeout(1600);
  await page.getByTestId('dashboard-page').screenshot({ path: `${SHOT_DIR}/${name}` });
}

async function applyLook(page: P, steps: string[]) {
  await openAppearance(page);
  for (const testId of steps) await clickInPanel(page, testId);
  await closePanel(page);
}

test('capture the seven looks at mobile and tablet', async ({ page }) => {
  test.setTimeout(420_000);

  const email = uniqueE2eEmail('theme-small');
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

  const SIZES = [
    { name: 'mobile', width: 375, height: 11000 },
    { name: 'tablet', width: 768, height: 9000 },
  ] as const;

  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(600);
    await closeSidebarOverlay(page);

    // Reset to light before this size's series (dark/shuffle state carries over).
    await applyLook(page, [
      'theme-light',
      'named-preset-violet',
      'dashboard-variant-classic',
    ]);
    await shoot(page, `${size.name}-1-violet-classic.png`);

    await applyLook(page, ['named-preset-emerald', 'dashboard-variant-command']);
    await shoot(page, `${size.name}-2-emerald-command.png`);

    await applyLook(page, ['named-preset-rose', 'dashboard-variant-pulse']);
    await shoot(page, `${size.name}-3-rose-pulse.png`);

    await applyLook(page, ['named-preset-ocean', 'dashboard-variant-bento']);
    await shoot(page, `${size.name}-4-ocean-bento.png`);

    await applyLook(page, [
      'theme-dark',
      'named-preset-violet',
      'dashboard-variant-command',
    ]);
    await shoot(page, `${size.name}-5-dark-violet-command.png`);

    const shuffle = page.getByTestId('dashboard-theme-shuffle');
    await shuffle.scrollIntoViewIfNeeded();
    await shuffle.click();
    await shoot(page, `${size.name}-6-random-shuffle-a.png`);
    const shuffleAgain = page.getByTestId('dashboard-theme-shuffle');
    await shuffleAgain.scrollIntoViewIfNeeded();
    await shuffleAgain.click();
    await shoot(page, `${size.name}-7-random-shuffle-b.png`);
  }
});

declare global {
  var __coreFeEstablishSession: ((accessToken: string) => Promise<void>) | undefined;
}
