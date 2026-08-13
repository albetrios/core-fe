/**
 * Shared result shapes for the browser half of the live tier.
 *
 * @remarks
 * Deliberately does **not** declare `window.turnstile` or `window.Stripe`. Both globals are already
 * typed in the app's own sources — `turnstile` by `InvisibleTurnstile.tsx`, `Stripe` by
 * `@stripe/stripe-js` — and redeclaring them here would both conflict and let this tier drift from
 * the types the app is actually compiled against. Reusing the app's declarations means these tests
 * fail to compile if a vendor's types change, which is a signal worth keeping.
 */

/** Outcome of driving a real Turnstile widget to completion (or to its deadline). */
export type TurnstileWidgetOutcome =
  | { outcome: 'token'; token: string }
  | { outcome: 'error' }
  | { outcome: 'expired' }
  | { outcome: 'timeout' }
  | { outcome: 'threw'; message: string };

/** Result of injecting a vendor script tag: whether this call added it or found it present. */
export type ScriptLoadOutcome = 'loaded' | 'already-loaded';
