import { expect, type Page, test } from '@playwright/test';

import { navigateInApp } from '@/tests/utils/e2e-auth.ts';
import { uniqueE2eEmail } from '@/tests/utils/e2e-faker.ts';
import {
  e2eAuthHeaders,
  pollVerificationCodeFromMailOutbox,
} from '@/tests/utils/e2e-session.ts';

/**
 * TEMP responsive audit (not part of the suite's assertions): checks every
 * dashboard arrangement at mobile/tablet widths for page-level horizontal
 * overflow and saves screenshots for design review. Delete freely.
 */
const SHOT_DIR = 'test-results/responsive-shots';

type P = Page;

const VARIANTS = ['classic', 'command', 'pulse', 'bento'] as const;

async function closeSidebarOverlay(page: P) {
  // Resizing desktop→mobile leaves the drawer open over the content; real
  // mobile sessions start closed. Tap the scrim (right of the 280px drawer)
  // exactly like a user would.
  const viewport = page.viewportSize();
  // The sidebar is a drawer below `lg` (1024px) — it used to be `md` (768px),
  // which left tablets out of this helper.
  if (!viewport || viewport.width >= 1024) return;
  const sidebar = page.getByTestId('sidebar');
  if (await sidebar.isVisible()) {
    await page.mouse.click(viewport.width - 12, 200);
    await page.waitForTimeout(500);
  }
}

async function pickVariant(page: P, id: string) {
  // The floating edge button hides on small screens; the theme strip's
  // Customize link opens the same Appearance dialog at every width.
  const customize = page.getByTestId('dashboard-theme-customize');
  await customize.scrollIntoViewIfNeeded();
  await customize.click();
  const option = page.getByTestId(`dashboard-variant-${id}`);
  await option.scrollIntoViewIfNeeded();
  await option.click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
  await page.waitForTimeout(900);
}

async function overflowPx(page: P): Promise<number> {
  return page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return Math.max(0, root.scrollWidth - window.innerWidth);
  });
}

test('dashboard arrangements stay overflow-free on mobile and tablet', async ({
  page,
}) => {
  test.setTimeout(300_000);

  const email = uniqueE2eEmail('responsive');
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

  // Reload at each size so the shell mounts in its natural breakpoint state
  // (resizing desktop→mobile leaves the expanded sidebar overlaying content —
  // a state real mobile users never see). The refresh cookie restores the
  // session across reloads.
  const results: string[] = [];
  const SIZES = [
    { name: 'mobile', width: 375, height: 11000, shots: ['classic', 'bento'] },
    { name: 'tablet', width: 768, height: 9000, shots: ['command', 'bento'] },
  ] as const;

  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(600);
    await closeSidebarOverlay(page);
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 30_000 });

    for (const variant of VARIANTS) {
      await pickVariant(page, variant);
      const px = await overflowPx(page);
      results.push(`${size.name}/${variant}: ${px}px`);
      if ((size.shots as readonly string[]).includes(variant)) {
        await page
          .getByTestId('dashboard-page')
          .screenshot({ path: `${SHOT_DIR}/${size.name}-${variant}.png` });
      }
    }
  }
  for (const line of results) {
    const px = Number(line.split(': ')[1]?.replace('px', '') ?? '0');
    expect(px, line).toBeLessThanOrEqual(1);
  }
});

declare global {
  var __coreFeEstablishSession: ((accessToken: string) => Promise<void>) | undefined;
}
