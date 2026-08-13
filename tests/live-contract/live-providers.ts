/**
 * Opt-in gate for the live third-party contract tier.
 *
 * @remarks
 * Mirrors the model used by core-be's `src/tests/contract/live/`: a provider runs only when it is
 * named in `CONTRACT_LIVE_PROVIDERS`, so the default invocation of `pnpm test:e2e` makes zero
 * third-party network calls and this tier can never turn a normal run red because someone else's
 * service is down.
 *
 * `CONTRACT_LIVE_PROVIDERS=turnstile,stripe` — comma-separated, or `all`.
 */
export type LiveProvider = 'turnstile' | 'stripe';

function enabledProviders(): Set<string> {
  const raw = process.env.CONTRACT_LIVE_PROVIDERS ?? '';
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Whether a given provider was explicitly opted in for this run. */
export function isLiveProviderEnabled(provider: LiveProvider): boolean {
  const enabled = enabledProviders();
  return enabled.has('all') || enabled.has(provider);
}

/**
 * Cloudflare's published Turnstile **site** keys (the browser-side half).
 *
 * @remarks
 * These are documented, account-free values, which is what makes this tier runnable anywhere. They
 * pair with the secret keys core-be's live Turnstile contract uses.
 *
 * @see https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_TEST_SITE_KEY = {
  /** Always passes, renders invisibly — the widget the app actually uses. */
  alwaysPassesInvisible: '1x00000000000000000000AA',
  /** Always passes, renders visibly. */
  alwaysPassesVisible: '1x00000000000000000000BB',
  /** Always blocks — drives the error path. */
  alwaysBlocks: '2x00000000000000000000AB',
  /** Forces an interactive challenge. */
  forcesInteractive: '3x00000000000000000000FF',
} as const;

/** Stripe's publishable sample key from its own public documentation. */
export const STRIPE_SAMPLE_PUBLISHABLE_KEY = 'pk_test_TYooMQauvdEDq54NiTphI7jx';

/** Publishable key for the live Stripe tier: the configured one, else Stripe's documented sample. */
export function stripePublishableKeyForLiveTests(): string {
  const configured = process.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (configured?.startsWith('pk_test_')) return configured;
  // Never fall through to a live key: a `pk_live_` value would point these tests at real customers.
  return STRIPE_SAMPLE_PUBLISHABLE_KEY;
}
