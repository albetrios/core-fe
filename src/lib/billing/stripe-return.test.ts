import { describe, expect, it } from 'vitest';

import {
  omitStripeReturnParams,
  readStripeBillingReturnParams,
  stripeReturnCleanupNavigation,
} from './stripe-return.ts';

describe('stripe-return', () => {
  it('reads Stripe return params from a search string', () => {
    const params = readStripeBillingReturnParams(
      '?payment_intent_client_secret=pi_secret&redirect_status=succeeded',
    );
    expect(params.paymentIntentClientSecret).toBe('pi_secret');
    expect(params.redirectStatus).toBe('succeeded');
    expect(params.setupIntentClientSecret).toBeNull();
  });

  it('strips every Stripe return param from a router search object', () => {
    const next = omitStripeReturnParams({
      tab: 'billing',
      payment_intent: 'pi_1',
      payment_intent_client_secret: 'pi_secret',
      setup_intent: 'si_1',
      setup_intent_client_secret: 'si_secret',
      redirect_status: 'succeeded',
    });

    expect(next).toEqual({ tab: 'billing' });
  });

  it('cleans up on the same route, in place, and KEEPS the hash', () => {
    // Regression: billing lives in the settings HASH modal. TanStack Router
    // resolves an omitted `hash` to "none", so three hand-written copies of these
    // options cleared the Stripe params AND `#settings/account/billing` — the
    // modal closed under a customer who had just come back from 3DS.
    const navigation = stripeReturnCleanupNavigation();

    expect(navigation.to).toBe('.');
    expect(navigation.replace).toBe(true);
    expect(navigation.hash).toBe(true);
  });

  it('strips only Stripe’s params through the cleanup navigation', () => {
    const updater = stripeReturnCleanupNavigation().search as unknown as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(
      updater({
        redirect_status: 'succeeded',
        payment_intent_client_secret: 'pi_secret',
        setup_intent_client_secret: 'seti_secret',
        tab: 'billing',
      }),
    ).toEqual({ tab: 'billing' });
  });

  it('does not mutate the input search object', () => {
    const input = { redirect_status: 'succeeded', q: 'x' };
    const next = omitStripeReturnParams(input);
    expect(input).toEqual({ redirect_status: 'succeeded', q: 'x' });
    expect(next).not.toBe(input);
    expect(next).toEqual({ q: 'x' });
  });
});
