import { loadStripe, type Stripe } from '@stripe/stripe-js';

import { getStripePublishableKey } from '@/shared/billing/stripe-config.ts';

let stripePromise: Promise<Stripe | null> | null = null;

/** Singleton Stripe.js loader — returns null when no publishable key is configured. */
export function getStripePromise(): Promise<Stripe | null> {
  const publishableKey = getStripePublishableKey();
  if (!publishableKey) return Promise.resolve(null);

  stripePromise ??= loadStripe(publishableKey);
  return stripePromise;
}
