const STRIPE_RETURN_PARAMS = [
  'payment_intent',
  'payment_intent_client_secret',
  'setup_intent',
  'setup_intent_client_secret',
  'redirect_status',
] as const;

export interface StripeBillingReturnParams {
  paymentIntentClientSecret: string | null;
  setupIntentClientSecret: string | null;
  redirectStatus: string | null;
}

/** Reads Stripe return query params after a redirect (3DS / SCA). */
export function readStripeBillingReturnParams(
  search = typeof window !== 'undefined' ? window.location.search : '',
): StripeBillingReturnParams {
  const params = new URLSearchParams(search);
  return {
    paymentIntentClientSecret: params.get('payment_intent_client_secret'),
    setupIntentClientSecret: params.get('setup_intent_client_secret'),
    redirectStatus: params.get('redirect_status'),
  };
}

/**
 * Returns a copy of the current route search with every Stripe return param
 * removed. Feed this to TanStack Router's `navigate({ search })` so the router
 * stays the source of truth — a raw `history.replaceState` here would strip the
 * params from the address bar but leave the router's cached location holding
 * them, and the next router navigation would reintroduce them.
 */
export function omitStripeReturnParams<T extends Record<string, unknown>>(search: T): T {
  const next = { ...search };
  for (const key of STRIPE_RETURN_PARAMS) {
    delete next[key];
  }
  return next;
}

/**
 * The `navigate()` options that clear Stripe's return params — and nothing else.
 *
 * @remarks
 * `hash: true` is the point of this function. Billing lives inside the settings
 * HASH modal (`#settings/account/billing`), and TanStack Router resolves an
 * omitted `hash` to "none" (`buildLocation`: `dest.hash === true ? current :
 * dest.hash ? … : undefined`). Three call sites each spelled these options out by
 * hand without it, so clearing the params also cleared the hash: the modal closed
 * under a customer who had just come back from 3DS. `true` keeps whatever hash the
 * router currently holds, so the legacy `#settings/organization/billing` link
 * survives its own canonicalization as well.
 *
 * `search` is cast because the router types it per route, and this works on
 * whichever route the modal happens to be open over.
 */
export function stripeReturnCleanupNavigation() {
  return {
    to: '.',
    search: ((previous: Record<string, unknown>) =>
      omitStripeReturnParams(previous)) as never,
    hash: true,
    replace: true,
  } as const;
}

export function stripeBillingReturnUrl(): string {
  if (typeof window === 'undefined') return '#settings/account/billing';
  return `${window.location.origin}${window.location.pathname}${window.location.search}#settings/account/billing`;
}
