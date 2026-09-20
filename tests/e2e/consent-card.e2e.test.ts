import { expect, type Page, test } from '@playwright/test';

import { registerNewUserAndGoToDashboard } from '@/tests/utils/e2e-auth.ts';
import { byTestId, expectLoginFormReady } from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * Cookie-consent card (`shared/components/ConsentBanner`) — its PLACEMENT, which
 * only a browser can prove.
 *
 * It used to be a full-width bar along the bottom edge. That put "Accept" in the
 * bottom-end corner underneath the Sentry feedback trigger, and laid the bar
 * over the mobile tab bar. It is now a compact card in the bottom-START corner
 * that rides above the tab bar.
 *
 * The suite's shared storage state pre-answers consent (so the card never gets
 * in any other spec's way); these tests start undecided.
 */
const UNDECIDED = { cookies: [], origins: [] };

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(page: Page, testId: string): Promise<Box> {
  const box = await byTestId(page, testId).boundingBox();
  if (!box) throw new Error(`${testId} has no layout box`);
  return box;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return Math.max(0, root.scrollWidth - window.innerWidth);
  });
}

test.describe('Cookie consent card', () => {
  test.use({ storageState: UNDECIDED });

  test('sits in the bottom-start corner on desktop, not across the page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await expectLoginFormReady(page);

    await expect(page.getByRole('region', { name: 'Cookie consent' })).toBeVisible();
    const card = await boxOf(page, 'consent-banner');

    // A corner card: start-aligned, a fraction of the viewport wide…
    expect(card.x).toBeLessThanOrEqual(32);
    expect(card.width).toBeLessThan(1440 / 3);
    // …floating off the bottom edge, leaving the END corner entirely free.
    expect(card.y + card.height).toBeLessThan(900);
    expect(card.x + card.width).toBeLessThan(1440 / 2);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('gives Accept and Decline the same size', async ({ page }) => {
    await page.goto('/login');
    await expectLoginFormReady(page);

    const accept = await boxOf(page, 'consent-accept');
    const decline = await boxOf(page, 'consent-decline');

    expect(Math.abs(accept.width - decline.width)).toBeLessThanOrEqual(2);
    expect(accept.height).toBe(decline.height);
  });

  test('mirrors to the other corner under RTL', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'locale-preference',
        JSON.stringify({ state: { locale: 'en', textDirection: 'rtl' }, version: 7 }),
      );
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(byTestId(page, 'consent-banner')).toBeVisible({ timeout: 15_000 });

    const card = await boxOf(page, 'consent-banner');

    // Logical `start-*`: the start corner is on the RIGHT now.
    expect(card.x).toBeGreaterThan(1440 / 2);
    expect(1440 - (card.x + card.width)).toBeLessThanOrEqual(32);
  });

  test('is an inset sheet on a phone and keeps both buttons a full touch target wide', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/login');
    await expectLoginFormReady(page);

    const card = await boxOf(page, 'consent-banner');

    expect(card.x).toBeGreaterThanOrEqual(8);
    expect(card.x + card.width).toBeLessThanOrEqual(360 - 8);
    expect(card.width).toBeGreaterThan(300);
    expect((await boxOf(page, 'consent-accept')).width).toBeGreaterThanOrEqual(120);
    expect((await boxOf(page, 'consent-decline')).width).toBeGreaterThanOrEqual(120);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('a decision is remembered and the card does not come back', async ({ page }) => {
    await page.goto('/login');
    await expectLoginFormReady(page);

    await byTestId(page, 'consent-decline').click();
    await expect(byTestId(page, 'consent-banner')).toBeHidden();

    await page.reload();
    await expectLoginFormReady(page);
    await expect(byTestId(page, 'consent-banner')).toBeHidden();
  });

  test('rides above the mobile tab bar instead of covering it', async ({ page }) => {
    test.setTimeout(120_000);
    expect(
      await verifyDatabaseConnection(),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    // The whole sign-up runs with the card still up — including the onboarding
    // wizard, whose Continue button sits at the very end of the page, exactly
    // where a full-width card lands. The page reserves the card's height at its
    // end, so every step can still be scrolled clear of it and pressed.
    await registerNewUserAndGoToDashboard(page);
    await expect(byTestId(page, 'consent-banner')).toBeVisible();

    const tabBar = await boxOf(page, 'mobile-bottom-bar');
    const card = await boxOf(page, 'consent-banner');

    expect(overlaps(card, tabBar)).toBe(false);
    expect(card.y + card.height).toBeLessThanOrEqual(tabBar.y);
  });
});
