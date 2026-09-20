import { expect, type Page, test } from '@playwright/test';

import { registerNewUserAndGoToDashboard } from '@/tests/utils/e2e-auth.ts';
import { byTestId, expectLoginFormReady } from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

/**
 * "Square means square" — the Corner radius and Shape axes, measured.
 *
 * Both axes are implemented in CSS (`index.css`): `--radius-*` tokens that every
 * named `rounded-*` step derives from, and a `[data-shape='sharp']` list that
 * squares the elements that are round BY DESIGN (`rounded-full`). jsdom resolves
 * neither, so the unit suite can only pin the stylesheet's TEXT. This spec asks
 * the browser for the computed `border-radius` of every painted element instead,
 * which is the only place a missed element can actually show up: an off-scale
 * `rounded-[3px]`, a `rounded-full` chip nobody tagged, a placeholder without
 * the skeleton slot, a third-party widget.
 *
 * The look is seeded before the app boots, the way a returning user has it.
 */
function lookWith(radiusId: string, shapeId: string, densityId = 'cozy') {
  return {
    state: {
      theme: 'light',
      preset: 'custom',
      customTheme: {
        hue: 290,
        chartHue: 290,
        bodyFontId: 'inter',
        headingFontId: 'inter',
        radiusId,
        shapeId,
        densityId,
      },
    },
    version: 3,
  };
}

/** Corner radius "None" + the Sharp shape: the look with no round corner in it. */
const SQUARE_LOOK = lookWith('sharp', 'sharp');

async function seedSquareLook(page: Page): Promise<void> {
  await page.addInitScript((look) => {
    localStorage.setItem('theme-preference', JSON.stringify(look));
  }, SQUARE_LOOK);
}

/**
 * Every painted element that still has a rounded corner, minus the indicators
 * that stay round on purpose. Each exemption is a rule, never a selector list:
 *
 * - a **status dot** — at most 10px on both sides, by LAYOUT size: the ping
 *   halo behind a dot is scaled up by its animation, and is still a dot;
 * - a **glow** — blurred, so it has no edge to be round or square — and the
 *   solid **core** that sits inside one (the assistant orb): a square core in a
 *   round halo reads as a rendering bug;
 * - **dev tooling** — the TanStack devtools launcher. `VITE_DEVTOOLS` is off in
 *   production (`validate:client-env` hard-fails otherwise), so it never ships.
 */
async function roundedElements(page: Page): Promise<string[]> {
  // Everything below runs IN the page, so the helpers live inside the callback.
  return page.evaluate(() => {
    const isBlurred = (el: Element) => getComputedStyle(el).filter.includes('blur');

    const hasRoundCorner = (style: CSSStyleDeclaration) =>
      [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ].some((corner) => Number.parseFloat(corner) > 0);

    /** A radius only shows on something rendered that paints an edge. */
    const paintsAnEdge = (el: HTMLElement, style: CSSStyleDeclaration) => {
      if (el.getClientRects().length === 0 || style.visibility === 'hidden') return false;
      return (
        style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
        style.backgroundImage !== 'none' ||
        Number.parseFloat(style.borderTopWidth) > 0 ||
        style.boxShadow !== 'none' ||
        style.overflow !== 'visible'
      );
    };

    const isExempt = (el: HTMLElement) => {
      if (el.offsetWidth <= 10 && el.offsetHeight <= 10) return true; // status dot
      if (isBlurred(el)) return true; // glow
      const siblings = [...(el.parentElement?.children ?? [])];
      if (siblings.some((sibling) => isBlurred(sibling))) return true; // a glow's core
      return el.closest('[class*="tsqd-"], .TanStackRouterDevtools') !== null;
    };

    const describe = (el: Element) =>
      [
        el.tagName.toLowerCase(),
        el.getAttribute('data-testid') ?? el.getAttribute('data-slot') ?? '-',
        el.getAttribute('class')?.slice(0, 90) ?? '',
      ].join(' | ');

    return [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const style = getComputedStyle(el);
        return hasRoundCorner(style) && paintsAnEdge(el, style) && !isExempt(el);
      })
      .map((el) => describe(el));
  });
}

test.describe('Square look — radius None + Sharp shape', () => {
  test('the sign-in screen has no rounded corner left', async ({ page }) => {
    await seedSquareLook(page);
    await page.goto('/login');
    await expectLoginFormReady(page);

    await expect(page.locator('html')).toHaveAttribute('data-shape', 'sharp');
    expect(await roundedElements(page)).toEqual([]);
  });

  test.describe('signed in', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(
        !(await verifyDatabaseConnection()),
        'DATABASE_URL must reach core-be Postgres (mail_outbox)',
      );
      await seedSquareLook(page);
      await registerNewUserAndGoToDashboard(page);
      await expect(page.locator('html')).toHaveAttribute('data-shape', 'sharp');
    });

    test('the dashboard and the shell have no rounded corner left', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(byTestId(page, 'dashboard-greeting')).toBeVisible();
      // Below-the-fold widgets mount as they scroll into view.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);

      expect(await roundedElements(page)).toEqual([]);
    });

    test('the phone shell — tab bar and header — has none either', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(byTestId(page, 'dashboard-greeting')).toBeVisible();

      expect(await roundedElements(page)).toEqual([]);
    });

    test('open overlays have none: settings, appearance, notifications', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });

      // Settings — notifications is the section with the most switches in it.
      await page.goto(`${new URL(page.url()).pathname}#settings/account/notifications`);
      await expect(byTestId(page, 'settings-modal')).toBeVisible();
      await expect(byTestId(page, 'settings-content-loading')).toHaveCount(0);
      expect(await roundedElements(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(byTestId(page, 'settings-modal')).toHaveCount(0);

      // The appearance panel — swatches, previews, every picker.
      await byTestId(page, 'floating-settings').click();
      await expect(byTestId(page, 'appearance-panel')).toBeVisible();
      expect(await roundedElements(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(byTestId(page, 'appearance-panel')).toHaveCount(0);

      await byTestId(page, 'notification-bell').click();
      await expect(byTestId(page, 'notification-popover')).toBeVisible();
      expect(await roundedElements(page)).toEqual([]);
    });
  });

  test('the Round look grows the same corners the square look removes', async ({
    page,
  }) => {
    // The other direction of the axis. The submit button sits on `rounded-md`, a
    // named step, so it must move with `--radius-lg`: 0 under None (the sweep
    // above), larger than stock under Round.
    const submitCorner = () =>
      byTestId(page, 'auth-email-submit').evaluate((el) =>
        Number.parseFloat(getComputedStyle(el).borderTopLeftRadius),
      );

    await page.goto('/login');
    await expectLoginFormReady(page);
    const stock = await submitCorner();
    expect(stock).toBeGreaterThan(0);

    await page.evaluate(
      (look) => localStorage.setItem('theme-preference', JSON.stringify(look)),
      lookWith('round', 'uniform'),
    );
    await page.reload();
    await expectLoginFormReady(page);

    expect(await submitCorner()).toBeGreaterThan(stock);
  });

  test('the default look is untouched — the same sweep finds round corners', async ({
    page,
  }) => {
    // The control: proof the sweep can see a rounded corner at all. Without it,
    // an `evaluate` that silently matched nothing would pass every test above.
    await page.goto('/login');
    await expectLoginFormReady(page);

    expect((await roundedElements(page)).length).toBeGreaterThan(0);
  });
});

test.describe('Elevation axis — the `:is()` slot lists still reach their slots', () => {
  // `index.css` lists the axis slots inside `:is()` (one prefix per list — it is
  // what keeps the initial CSS inside its budget). A selector typo in there is
  // silent: the stylesheet parses, the unit suite can only read its text, and
  // the axis simply stops applying. So: set the attribute, read the shadow.
  //
  // The subject is the consent card — a floating `surface` — so this runs as a
  // first-time visitor (the suite's shared storage state pre-answers consent).
  test.use({ storageState: { cookies: [], origins: [] } });

  const shadowOf = (page: Page, selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).boxShadow);

  test('flat removes the consent card’s shadow; floating deepens it', async ({
    page,
  }) => {
    await page.goto('/login');
    await expectLoginFormReady(page);
    const card = '[data-slot="surface"][data-floating]';
    await expect(page.locator(card)).toBeVisible();

    const resting = await shadowOf(page, card);
    expect(resting).not.toBe('none');

    // `expect.poll`: the card transitions its shadow, so the value read in the
    // same tick as the attribute change is still the old one.
    await page.evaluate(() => {
      document.documentElement.dataset.elevation = 'flat';
    });
    await expect.poll(() => shadowOf(page, card)).toBe('none');

    await page.evaluate(() => {
      document.documentElement.dataset.elevation = 'floating';
    });
    await expect.poll(() => shadowOf(page, card)).not.toBe('none');
    await expect.poll(() => shadowOf(page, card)).not.toBe(resting);
  });
});

test.describe('Density axis — the settings modal’s insets follow the theme', () => {
  // The settings modal lays out its own panes (`p-0`), so it has to reproduce the
  // inset every other dialog gets from `DialogContent` (`p-6`). Written as scale
  // steps those insets are `calc(var(--spacing) * 6)`, and Density is what sets
  // `--spacing` — so they must move with the setting, by exactly six units. A
  // fixed `[24px]` would look identical on the default look and ignore the axis.
  for (const densityId of ['compact', 'airy'] as const) {
    test(`"${densityId}": search box, nav and content pane are all 6 spacing units in`, async ({
      page,
    }) => {
      test.skip(
        !(await verifyDatabaseConnection()),
        'DATABASE_URL must reach core-be Postgres (mail_outbox)',
      );
      await page.addInitScript(
        (look) => {
          localStorage.setItem('theme-preference', JSON.stringify(look));
        },
        lookWith('default', 'uniform', densityId),
      );
      await page.setViewportSize({ width: 1280, height: 800 });
      await registerNewUserAndGoToDashboard(page);

      await page.goto(`${new URL(page.url()).pathname}#settings/account/profile`);
      await expect(byTestId(page, 'settings-section-profile')).toBeVisible();

      const insets = await page.evaluate(() => {
        const px = (
          el: Element | null | undefined,
          side: 'paddingLeft' | 'paddingTop',
        ) => (el ? Number.parseFloat(getComputedStyle(el)[side]) : Number.NaN);
        const root = getComputedStyle(document.documentElement);
        const unit =
          Number.parseFloat(root.getPropertyValue('--spacing')) *
          Number.parseFloat(root.fontSize);
        const searchPane = document.querySelector('[data-testid="settings-search"]')
          ?.parentElement?.parentElement;
        return {
          unit,
          searchLeft: px(searchPane, 'paddingLeft'),
          searchTop: px(searchPane, 'paddingTop'),
          nav: px(
            document.querySelector('[data-testid="settings-nav"] nav'),
            'paddingLeft',
          ),
          content: px(
            document.querySelector('[data-testid="settings-content"]'),
            'paddingLeft',
          ),
        };
      });

      // Not the stock 4px: the axis really is driving the unit on this page.
      expect(insets.unit).not.toBeCloseTo(4, 1);
      for (const inset of [
        insets.searchLeft,
        insets.searchTop,
        insets.nav,
        insets.content,
      ]) {
        expect(inset).toBeCloseTo(insets.unit * 6, 1);
      }
    });
  }
});
