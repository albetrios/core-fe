import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
    __loaded: true,
  },
}));

vi.mock('@/core/config/env.ts', () => ({
  platformConfig: {
    posthogKey: 'phc_test_key',
    posthogHost: 'https://us.i.posthog.com',
  },
}));

vi.mock('@/shared/store/useConsentStore/index.ts', () => ({
  hasAnalyticsConsent: vi.fn(() => true),
}));

import posthog from 'posthog-js';

import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';

import { markPostHogActive } from './capture.ts';
import { captureAnalyticsConsentDecision } from './capture-consent-decision.ts';

describe('captureAnalyticsConsentDecision', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('captures a PostHog event when consent is granted', async () => {
    await captureAnalyticsConsentDecision('granted');
    await vi.waitFor(() => {
      expect(posthog.capture).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.consentDecision,
        expect.objectContaining({
          decision: 'granted',
          source: 'consent_banner',
        }),
      );
    });
  });

  it('does not capture when consent is denied', async () => {
    await captureAnalyticsConsentDecision('denied');

    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('purges PostHog state when consent is denied after it was active', async () => {
    markPostHogActive();
    await captureAnalyticsConsentDecision('denied');

    await vi.waitFor(() => {
      expect(posthog.opt_out_capturing).toHaveBeenCalled();
      expect(posthog.reset).toHaveBeenCalledWith(true);
    });
    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
