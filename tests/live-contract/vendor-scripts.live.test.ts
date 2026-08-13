import { describe, expect, it } from 'vitest';

import { isLiveProviderEnabled } from './live-providers.ts';

/**
 * Live vendor-script contract — the CDN URLs core-fe hardcodes, fetched for real.
 *
 * @remarks
 * Every third-party integration in this app begins with a `<script src>` pointing at a vendor CDN.
 * Those URLs are string literals in the source, so nothing fails when one is retired, renamed, or
 * starts serving something else — the app simply stops loading captcha or payments in production
 * while every mocked test stays green.
 *
 * This tier fetches each URL the app actually uses and asserts the response is a servable script
 * exposing the global the app then reaches for. It runs in Node, so it needs no browser and works
 * anywhere the tests can make an outbound request. Widget rendering and Elements mounting need a
 * real browser and live in the sibling `*.live.e2e.test.ts` files.
 *
 * Opt in with `CONTRACT_LIVE_PROVIDERS=turnstile,stripe`.
 */
const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const STRIPE_SCRIPT_URL = 'https://js.stripe.com/v3';

async function fetchScript(
  url: string,
): Promise<{ status: number; contentType: string; body: string }> {
  const response = await fetch(url, { redirect: 'follow' });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body: await response.text(),
  };
}

describe.skipIf(!isLiveProviderEnabled('turnstile'))(
  'Cloudflare Turnstile script LIVE contract',
  () => {
    it('serves the explicit-render script from the URL InvisibleTurnstile hardcodes', async () => {
      const { status, contentType, body } = await fetchScript(TURNSTILE_SCRIPT_URL);

      expect(status).toBe(200);
      expect(contentType).toMatch(/javascript/i);
      expect(body.length).toBeGreaterThan(0);
    });

    it('the served script still installs a `turnstile` global with render()', async () => {
      // The component calls `window.turnstile.render(container, { sitekey, callback })`. If the
      // vendor ever renames that entry point, the bundle stops containing the identifier and this
      // fails before anyone hits it in a browser.
      const { body } = await fetchScript(TURNSTILE_SCRIPT_URL);

      expect(body).toContain('turnstile');
      expect(body).toMatch(/render/);
    });

    it('rejects the explicit-render URL being silently redirected off Cloudflare', async () => {
      // A redirect to another origin would mean the app is loading executable code from somewhere
      // other than the vendor it intends to trust.
      const response = await fetch(TURNSTILE_SCRIPT_URL, { redirect: 'follow' });

      expect(new URL(response.url).hostname).toBe('challenges.cloudflare.com');
    });

    it('exposes the siteverify endpoint core-be verifies tokens against', async () => {
      // The browser mints a token; core-be redeems it here. Asserting both halves in the repo that
      // owns each keeps the pair from drifting apart silently.
      const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: '2x0000000000000000000000000000000AA',
          response: 'x',
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        'error-codes'?: string[];
      };

      expect(response.status).toBe(200);
      // The always-fails testing secret — proves the endpoint is live and answering in the documented
      // envelope without depending on any account of ours.
      expect(payload.success).toBe(false);
      expect(Array.isArray(payload['error-codes'])).toBe(true);
    });
  },
);

describe.skipIf(!isLiveProviderEnabled('stripe'))(
  'Stripe.js script LIVE contract',
  () => {
    it('serves Stripe.js from the URL loadStripe() uses', async () => {
      const { status, contentType, body } = await fetchScript(STRIPE_SCRIPT_URL);

      expect(status).toBe(200);
      expect(contentType).toMatch(/javascript/i);
      expect(body.length).toBeGreaterThan(0);
    });

    it('the served script still installs the Stripe global', async () => {
      const { body } = await fetchScript(STRIPE_SCRIPT_URL);

      expect(body).toContain('Stripe');
    });

    it('stays on js.stripe.com through any redirect', async () => {
      const response = await fetch(STRIPE_SCRIPT_URL, { redirect: 'follow' });

      expect(new URL(response.url).hostname).toBe('js.stripe.com');
    });

    it('is served over HTTPS with a long-lived cache policy', async () => {
      // Stripe requires its script be loaded directly from their CDN on every page rather than
      // self-hosted; a missing cache header would mean we are not talking to that CDN.
      const response = await fetch(STRIPE_SCRIPT_URL, { redirect: 'follow' });

      expect(response.url.startsWith('https://')).toBe(true);
      expect(response.headers.get('cache-control')).toBeTruthy();
    });
  },
);
