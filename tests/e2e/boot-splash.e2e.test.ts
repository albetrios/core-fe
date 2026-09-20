import { expect, type Page, test } from '@playwright/test';

import { registerNewUserAndGoToDashboard } from '@/tests/utils/e2e-auth.ts';
import { byTestId, expectLoginFormReady } from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * The cold load is ONE continuous screen: splash → content.
 *
 * Deliberately not a stopwatch — wall-clock numbers flake, and the dev server
 * these specs run against says nothing about production speed. It pins the two
 * things that made the first load FEEL slow, as invariants a browser can prove
 * at any speed:
 *
 * 1. **The splash fades exactly once.** A fade that starts and is then yanked
 *    back to full opacity (a loader mounting a beat late) is the "blink".
 * 2. **The page is never blank.** Whenever the splash is fading or gone, real
 *    content — or a loader that owns the viewport — is already mounted. Before
 *    the router's boot pending policy, a cold visit to anything but `/` faded the
 *    splash out over an empty page while a guard awaited `/auth/refresh`.
 *
 * (What the numbers were: `routeTree.tsx` → BOOT_PENDING_POLICY, and
 * `lib/app-splash.ts` → SETTLED_EXIT_DELAY_MS.)
 */
interface BootTrace {
  fadeStarts: number;
  fadeCancels: number;
  blankFrames: number;
}

/**
 * Observes the boot from the first byte. Content = anything that owns the
 * screen once the splash lets go of it.
 */
const TRACE_BOOT = `
(() => {
  const trace = { fadeStarts: 0, fadeCancels: 0, blankFrames: 0 };
  window.__bootTrace = trace;
  const CONTENT = [
    '[data-testid="login-form"]', '[data-testid="auth-form"]', 'form',
    '[data-testid="dashboard-page"]', '[data-testid="app-layout"]',
    '[data-testid="full-page-spinner"]', '[data-testid="onboarding-page"]',
    '[data-testid="not-found-page"]', 'main',
  ].join(',');
  let fading = false;
  const check = () => {
    const splash = document.getElementById('app-splash');
    const exiting = !!splash && splash.classList.contains('app-splash-exiting');
    if (exiting && !fading) trace.fadeStarts += 1;
    if (splash && !exiting && fading) trace.fadeCancels += 1;
    fading = exiting;
    if ((exiting || !splash) && document.body && !document.querySelector(CONTENT)) {
      trace.blankFrames += 1;
    }
  };
  new MutationObserver(check).observe(document, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
  });
})();
`;

async function bootTrace(page: Page): Promise<BootTrace> {
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 30_000 });
  return page.evaluate(
    () => (window as unknown as { __bootTrace: BootTrace }).__bootTrace,
  );
}

/**
 * Make the auth bootstrap take as long as it does on a real network.
 *
 * On localhost `/auth/refresh` answers in a few milliseconds, faster than the
 * splash can even begin to leave — so a boot that WOULD go blank while a guard
 * awaits the network never gets the chance to, and the test passes against the
 * bug. Holding the response open is what makes the invariant bite.
 */
async function slowAuthBootstrap(page: Page, delayMs = 1500): Promise<void> {
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

function expectOneContinuousScreen(trace: BootTrace) {
  expect(trace.fadeStarts, 'the splash fades out once').toBe(1);
  expect(trace.fadeCancels, 'a fade is never yanked back (the blink)').toBe(0);
  expect(trace.blankFrames, 'the page is never blank behind the splash').toBe(0);
}

test.describe('Cold load — one continuous screen', () => {
  test('a guest opening / lands on the login form', async ({ page }) => {
    await page.addInitScript(TRACE_BOOT);
    await slowAuthBootstrap(page);
    await page.goto('/');

    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await expectLoginFormReady(page);
    expectOneContinuousScreen(await bootTrace(page));
  });

  test('a guest opening a deep link is sent to login without a blank page', async ({
    page,
  }) => {
    // Not one of the four routes that used to opt into an immediate pending
    // state — a bookmarked dashboard is just as cold an entry as `/`.
    await page.addInitScript(TRACE_BOOT);
    await slowAuthBootstrap(page);
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await expectLoginFormReady(page);
    expectOneContinuousScreen(await bootTrace(page));
  });

  test('a signed-in user reloading the dashboard sees splash → dashboard, nothing between', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    expect(
      await verifyDatabaseConnection(),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    ).toBe(true);
    await registerNewUserAndGoToDashboard(page);

    await page.addInitScript(TRACE_BOOT);
    await slowAuthBootstrap(page);
    await page.reload();

    await expect(byTestId(page, 'dashboard-page')).toBeVisible({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/login/);
    expectOneContinuousScreen(await bootTrace(page));
  });

  test('a signed-in user opening / is taken to their dashboard the same way', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    expect(
      await verifyDatabaseConnection(),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    ).toBe(true);
    await registerNewUserAndGoToDashboard(page);

    await page.addInitScript(TRACE_BOOT);
    await page.goto('/');

    await expect(byTestId(page, 'dashboard-page')).toBeVisible({ timeout: 30_000 });
    expectOneContinuousScreen(await bootTrace(page));
  });
});
