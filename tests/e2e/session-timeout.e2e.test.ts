import { expect, type Page, test } from '@playwright/test';

import { registerNewUserAndGoToDashboard } from '@/tests/utils/e2e-auth.ts';
import { byTestId, expectLoginFormReady } from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * Idle session timeout (`shared/auth/idle-timeout.ts` +
 * `SessionTimeoutDialog`): after five idle minutes the warning opens, and both
 * of its exits — the "Sign out" button and the 90s deadline — must END the
 * session, not just leave the page.
 *
 * Two independent bugs used to make that impossible, and only a browser shows
 * either of them:
 *
 * 1. The activity listeners sit on `document`, so the `mousedown` half of a
 *    press on "Sign out" counted as "the user is back": the dialog closed under
 *    the pointer and the `click` never landed.
 * 2. The dialog called `forceLogout()`, which clears the tab but not the
 *    HttpOnly refresh cookie — `/login` booted, silently refreshed, and the
 *    guest-only guard sent the user back to the dashboard.
 *
 * The clock is virtual (`page.clock`), so five minutes cost nothing.
 */
const IDLE_WARNING = '05:01';
const GRACE_PERIOD = '01:31';

/** `METHOD /auth/<endpoint>` for every auth call the page makes. */
function recordAuthRequests(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/v1/auth/')) {
      calls.push(`${request.method()} ${pathname.replace('/api/v1', '')}`);
    }
  });
  return calls;
}

/**
 * Install the virtual clock, then reload so the idle timer is created under it
 * (timers that already exist keep running on the real clock).
 */
async function reloadUnderVirtualClock(page: Page): Promise<void> {
  await page.clock.install();
  await page.reload();
  await expect(byTestId(page, 'dashboard-page')).toBeVisible({ timeout: 30_000 });
}

/** The session is really gone: a fresh load cannot silently restore it. */
async function expectSignedOutForGood(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expectLoginFormReady(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expectLoginFormReady(page);
}

test.describe('Idle session timeout', () => {
  test.beforeEach(async () => {
    expect(
      await verifyDatabaseConnection(),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    ).toBe(true);
  });

  test('"Sign out" on the inactivity dialog ends the session', async ({ page }) => {
    test.setTimeout(120_000);
    await registerNewUserAndGoToDashboard(page);
    await reloadUnderVirtualClock(page);
    const authCalls = recordAuthRequests(page);

    await page.clock.fastForward(IDLE_WARNING);
    const dialog = byTestId(page, 'session-timeout-dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('alertdialog', { name: 'Session expiring' }),
    ).toBeVisible();
    // The safe default for an unattended prompt is the option that loses nothing.
    await expect(byTestId(page, 'session-stay')).toBeFocused();

    // A human press: the pointer goes down, time passes, the pointer comes up.
    // The dialog has to still be there when it does.
    const signOut = byTestId(page, 'session-signout');
    const box = await signOut.boundingBox();
    if (!box) throw new Error('Sign out button has no layout box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.clock.runFor(300);
    await expect(dialog).toBeVisible();
    await page.mouse.up();

    await expectSignedOutForGood(page);
    expect(authCalls).toContain('POST /auth/logout');
  });

  test('the keyboard can sign out from the inactivity dialog', async ({ page }) => {
    test.setTimeout(120_000);
    await registerNewUserAndGoToDashboard(page);
    await reloadUnderVirtualClock(page);

    await page.clock.fastForward(IDLE_WARNING);
    await expect(byTestId(page, 'session-timeout-dialog')).toBeVisible({
      timeout: 10_000,
    });
    await expect(byTestId(page, 'session-stay')).toBeFocused();

    // Shift+Tab moves from "Stay signed in" to "Sign out". Every one of these
    // keydowns used to dismiss the dialog before Enter could be pressed.
    await page.keyboard.press('Shift+Tab');
    await expect(byTestId(page, 'session-signout')).toBeFocused();
    await page.keyboard.press('Enter');

    await expectSignedOutForGood(page);
  });

  test('doing nothing signs the user out when the grace period ends', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await registerNewUserAndGoToDashboard(page);
    await reloadUnderVirtualClock(page);
    const authCalls = recordAuthRequests(page);

    await page.clock.fastForward(IDLE_WARNING);
    await expect(byTestId(page, 'session-timeout-dialog')).toBeVisible({
      timeout: 10_000,
    });
    await page.clock.fastForward(GRACE_PERIOD);

    await expectSignedOutForGood(page);
    expect(authCalls).toContain('POST /auth/logout');
  });

  test('"Stay signed in" keeps the session and restarts the clock', async ({ page }) => {
    test.setTimeout(120_000);
    await registerNewUserAndGoToDashboard(page);
    await reloadUnderVirtualClock(page);
    const authCalls = recordAuthRequests(page);

    await page.clock.fastForward(IDLE_WARNING);
    const dialog = byTestId(page, 'session-timeout-dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await byTestId(page, 'session-stay').click();
    await expect(dialog).toBeHidden();

    // The old deadline passes and nothing happens…
    await page.clock.fastForward(GRACE_PERIOD);
    await expect(byTestId(page, 'dashboard-page')).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
    expect(authCalls).not.toContain('POST /auth/logout');

    // …and the warning returns once a full idle period has passed since the
    // press (1:31 of it is already spent above).
    await page.clock.fastForward('03:31');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });
});
