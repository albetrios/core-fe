import { expect, type Page, test } from '@playwright/test';

import type { ScriptLoadOutcome } from './browser-globals.ts';
import {
  isLiveProviderEnabled,
  stripePublishableKeyForLiveTests,
} from './live-providers.ts';

/**
 * Live Stripe.js contract — the real script from js.stripe.com in a real browser.
 *
 * @remarks
 * `getStripePromise()` calls `loadStripe()`, which injects Stripe's script and hands back a Stripe
 * instance. Unit tests mock `@stripe/stripe-js` wholesale, so nothing verifies that the CDN still
 * serves a script exposing the API `StripePaymentForm` relies on — `elements()`, `confirmPayment`,
 * `confirmSetup` — or that mounting a Payment Element still produces a card iframe.
 *
 * A publishable key is safe in a browser by design; the gate in `live-providers.ts` refuses
 * anything that is not `pk_test_`, falling back to Stripe's own documented sample key so this tier
 * runs without configuration.
 *
 * Opt in with `CONTRACT_LIVE_PROVIDERS=stripe`.
 */
const STRIPE_SCRIPT_SRC = 'https://js.stripe.com/v3';

/** Injects Stripe.js the same way `loadStripe()` does. */
async function loadStripeScript(page: Page): Promise<ScriptLoadOutcome> {
  return page.evaluate(
    (src) =>
      new Promise<ScriptLoadOutcome>((resolve, reject) => {
        if (window.Stripe) {
          resolve('already-loaded');
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve('loaded');
        script.onerror = () => reject(new Error('Stripe.js failed to load'));
        document.head.appendChild(script);
      }),
    STRIPE_SCRIPT_SRC,
  );
}

test.describe('Stripe.js LIVE contract', () => {
  test.skip(
    !isLiveProviderEnabled('stripe'),
    'set CONTRACT_LIVE_PROVIDERS=stripe to run',
  );
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    // Stripe.js requires a real origin; Elements refuses to mount on about:blank.
    await page.goto('/');
  });

  test('js.stripe.com still serves a script exposing the Stripe constructor', async ({
    page,
  }) => {
    const result = await loadStripeScript(page);

    expect(['loaded', 'already-loaded']).toContain(result);
    expect(await page.evaluate(() => typeof window.Stripe)).toBe('function');
  });

  test('a publishable key yields an instance with the methods the payment form calls', async ({
    page,
  }) => {
    await loadStripeScript(page);

    const api = await page.evaluate((key) => {
      const stripe = window.Stripe?.(key);
      return {
        constructed: Boolean(stripe),
        hasElements: typeof stripe?.elements === 'function',
        hasConfirmPayment: typeof stripe?.confirmPayment === 'function',
        hasConfirmSetup: typeof stripe?.confirmSetup === 'function',
        hasRetrievePaymentIntent: typeof stripe?.retrievePaymentIntent === 'function',
      };
    }, stripePublishableKeyForLiveTests());

    // StripePaymentForm depends on each of these; a rename upstream would break checkout.
    expect(api.constructed).toBe(true);
    expect(api.hasElements).toBe(true);
    expect(api.hasConfirmPayment).toBe(true);
    expect(api.hasConfirmSetup).toBe(true);
    expect(api.hasRetrievePaymentIntent).toBe(true);
  });

  test('elements() accepts the setup-mode options the app passes', async ({ page }) => {
    await loadStripeScript(page);

    const result = await page.evaluate((key) => {
      try {
        const elements = window.Stripe?.(key).elements({
          mode: 'setup',
          currency: 'usd',
          paymentMethodCreation: 'manual',
        });
        return {
          ok: true,
          hasCreate: typeof elements?.create === 'function',
          message: '',
        };
      } catch (error) {
        return { ok: false, hasCreate: false, message: String(error) };
      }
    }, stripePublishableKeyForLiveTests());

    expect(result.ok, result.message).toBe(true);
    expect(result.hasCreate).toBe(true);
  });

  test("a Payment Element mounts and renders Stripe's iframe", async ({ page }) => {
    await loadStripeScript(page);

    await page.evaluate((key) => {
      const container = document.createElement('div');
      container.id = 'live-contract-payment-element';
      document.body.appendChild(container);
      const elements = window.Stripe?.(key).elements({ mode: 'setup', currency: 'usd' });
      elements?.create('payment').mount('#live-contract-payment-element');
    }, stripePublishableKeyForLiveTests());

    // The iframe is the real proof: it only appears once Stripe has accepted the key and fetched
    // its own UI. A rejected key leaves the container empty.
    const frame = page.locator('#live-contract-payment-element iframe').first();
    await expect(frame).toBeAttached({ timeout: 30_000 });
    expect(await frame.getAttribute('src')).toContain('stripe');
  });

  test('an invalid publishable key is rejected rather than silently accepted', async ({
    page,
  }) => {
    await loadStripeScript(page);

    const result = await page.evaluate(() => {
      try {
        window.Stripe?.('not-a-publishable-key');
        return { threw: false, message: '' };
      } catch (error) {
        return { threw: true, message: String(error) };
      }
    });

    expect(result.threw).toBe(true);
  });

  test('loading Stripe.js twice reuses the existing global', async ({ page }) => {
    // `getStripePromise()` caches its promise; this pins the assumption underneath that caching.
    await loadStripeScript(page);
    const second = await loadStripeScript(page);

    expect(second).toBe('already-loaded');
  });
});
