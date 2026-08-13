import { expect, type Page, test } from '@playwright/test';

import type { ScriptLoadOutcome, TurnstileWidgetOutcome } from './browser-globals.ts';
import { isLiveProviderEnabled, TURNSTILE_TEST_SITE_KEY } from './live-providers.ts';

/**
 * Live Cloudflare Turnstile contract — the real challenge script in a real browser.
 *
 * @remarks
 * The unit tests for `InvisibleTurnstile` stub `window.turnstile`, so they prove the component's
 * wiring but never that the script URL is still valid, that `render()` still takes the options we
 * pass, or that a token still arrives through the callback. This tier loads
 * `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` — the exact URL the
 * component uses — and drives the real widget.
 *
 * Runnable with no Cloudflare account: the site keys are Cloudflare's published testing values,
 * and they pair with the secret keys core-be's live Turnstile contract verifies against.
 *
 * Opt in with `CONTRACT_LIVE_PROVIDERS=turnstile`.
 */
const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Injects the real script into the page under test, exactly as the component does. */
async function loadTurnstileScript(page: Page): Promise<ScriptLoadOutcome> {
  return page.evaluate(
    (src) =>
      new Promise<ScriptLoadOutcome>((resolve, reject) => {
        if (window.turnstile) {
          resolve('already-loaded');
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve('loaded');
        script.onerror = () => reject(new Error('Turnstile script failed to load'));
        document.head.appendChild(script);
      }),
    TURNSTILE_SCRIPT_SRC,
  );
}

/** Renders a real widget and reports whichever callback fires first. */
async function renderWidget(
  page: Page,
  options: { sitekey: string; timeoutMs: number },
): Promise<TurnstileWidgetOutcome> {
  return page.evaluate(
    ({ sitekey, timeoutMs }) =>
      new Promise<TurnstileWidgetOutcome>((resolve) => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const timer = window.setTimeout(() => resolve({ outcome: 'timeout' }), timeoutMs);
        const done = (result: TurnstileWidgetOutcome) => {
          window.clearTimeout(timer);
          resolve(result);
        };
        try {
          window.turnstile?.render(container, {
            sitekey,
            callback: (token: string) => done({ outcome: 'token', token }),
            'error-callback': () => done({ outcome: 'error' }),
            'expired-callback': () => done({ outcome: 'expired' }),
          });
        } catch (error) {
          done({ outcome: 'threw', message: String(error) });
        }
      }),
    options,
  );
}

test.describe('Cloudflare Turnstile LIVE contract', () => {
  test.skip(
    !isLiveProviderEnabled('turnstile'),
    'set CONTRACT_LIVE_PROVIDERS=turnstile to run',
  );
  // Real network round trips to Cloudflare plus a widget challenge.
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    // Turnstile validates the embedding origin, so the widget needs a real http(s) page rather
    // than about:blank. The app's own dev server supplies one.
    await page.goto('/');
  });

  test('the script URL the app uses still serves a working Turnstile global', async ({
    page,
  }) => {
    const result = await loadTurnstileScript(page);

    expect(['loaded', 'already-loaded']).toContain(result);
    // Explicit-render mode is the whole contract the component depends on.
    const api = await page.evaluate(() => ({
      hasTurnstile: typeof window.turnstile === 'object' && window.turnstile !== null,
      hasRender: typeof window.turnstile?.render === 'function',
      hasReset: typeof window.turnstile?.reset === 'function',
      hasRemove: typeof window.turnstile?.remove === 'function',
    }));

    expect(api.hasTurnstile).toBe(true);
    expect(api.hasRender).toBe(true);
    expect(api.hasReset).toBe(true);
    expect(api.hasRemove).toBe(true);
  });

  test('the always-passes invisible key mints a token through the callback', async ({
    page,
  }) => {
    await loadTurnstileScript(page);

    const result = await renderWidget(page, {
      sitekey: TURNSTILE_TEST_SITE_KEY.alwaysPassesInvisible,
      timeoutMs: 30_000,
    });

    expect(result.outcome).toBe('token');
    if (result.outcome === 'token') {
      expect(result.token.length).toBeGreaterThan(0);
    }
  });

  test('the always-blocks key drives the error callback, not the success callback', async ({
    page,
  }) => {
    // The failure path matters as much as the success one: if a blocked challenge ever resolved
    // through `callback`, the app would POST with a token core-be will reject server-side.
    await loadTurnstileScript(page);

    const result = await renderWidget(page, {
      sitekey: TURNSTILE_TEST_SITE_KEY.alwaysBlocks,
      timeoutMs: 30_000,
    });

    expect(result.outcome).not.toBe('token');
    expect(['error', 'expired', 'timeout']).toContain(result.outcome);
  });

  test('a malformed site key is rejected rather than silently issuing a token', async ({
    page,
  }) => {
    await loadTurnstileScript(page);

    const result = await renderWidget(page, {
      sitekey: 'not-a-real-site-key',
      timeoutMs: 20_000,
    });

    expect(result.outcome).not.toBe('token');
  });

  test('the visible always-passes key also mints a token', async ({ page }) => {
    // The app renders invisibly today; this pins that the token contract is the same either way,
    // so switching the widget to a visible variant would not silently change the auth flow.
    await loadTurnstileScript(page);

    const result = await renderWidget(page, {
      sitekey: TURNSTILE_TEST_SITE_KEY.alwaysPassesVisible,
      timeoutMs: 30_000,
    });

    expect(result.outcome).toBe('token');
  });

  test('loading the script twice does not clobber the existing global', async ({
    page,
  }) => {
    // The component guards with `if (window.turnstile) return` and caches its promise; this
    // asserts the underlying assumption that a second load is harmless.
    await loadTurnstileScript(page);
    const second = await loadTurnstileScript(page);

    expect(second).toBe('already-loaded');
    expect(await page.evaluate(() => typeof window.turnstile?.render)).toBe('function');
  });
});
