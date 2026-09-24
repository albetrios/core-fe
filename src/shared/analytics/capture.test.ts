import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/store/useConsentStore/index.ts', () => ({
  hasAnalyticsConsent: vi.fn(() => true),
}));

vi.mock('posthog-js', () => ({
  default: {
    __loaded: true,
    capture: vi.fn(),
  },
}));

vi.mock('@/core/config/env.ts', () => ({
  platformConfig: {
    appVersion: '1.0.0',
    appBuildId: 'build_1',
    environment: 'test',
  },
}));

vi.mock('@/shared/store/useAuthStore/index.ts', () => ({
  useAuthStore: { getState: vi.fn(() => ({ isAuthenticated: false })) },
}));

vi.mock('@/shared/store/useOrganizationStore/index.ts', () => ({
  useOrganizationStore: {
    getState: vi.fn(() => ({
      organizationId: null,
      organizationSlug: null,
      organizationType: null,
      organizationStatus: null,
    })),
  },
}));

import posthog from 'posthog-js';

import { ANALYTICS_EVENTS } from './analytics.constants.ts';
import {
  captureAnalyticsEvent,
  getAnalyticsContext,
  scrubAnalyticsPath,
} from './capture.ts';

describe('captureAnalyticsEvent', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('captures events with shared context when PostHog is loaded', async () => {
    captureAnalyticsEvent(ANALYTICS_EVENTS.commandPaletteOpened);
    await vi.waitFor(() => {
      expect(posthog.capture).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.commandPaletteOpened,
        expect.objectContaining({
          app_version: '1.0.0',
          environment: 'test',
        }),
      );
    });
  });

  it('scrubs token query params from string properties', () => {
    const ctx = getAnalyticsContext();
    expect(ctx.environment).toBe('test');
    expect(scrubAnalyticsPath('/reset-password?token=secret')).toBe('/reset-password');
  });
});
