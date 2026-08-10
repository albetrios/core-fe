import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';

/**
 * Analytics-consent decision. `null` = undecided (the banner is shown);
 * `granted`/`denied` are explicit user choices.
 */
export type ConsentDecision = 'granted' | 'denied' | null;

interface ConsentStore {
  /** The user's analytics-cookie decision. */
  analyticsConsent: ConsentDecision;
  /** Record an explicit decision (Accept / Decline on the banner). */
  setAnalyticsConsent: (decision: Exclude<ConsentDecision, null>) => void;
  /** Reset to undecided (e.g. a "manage cookies" action). */
  resetAnalyticsConsent: () => void;
}

/**
 * Persisted analytics-consent state (GDPR / ePrivacy). Cookie-setting analytics
 * (PostHog) must NOT initialize until {@link ConsentStore.analyticsConsent} is
 * `granted`; see `app/analytics/posthog.ts` and the boot sequence in `main.tsx`.
 * Error monitoring (Sentry, no tracking cookies, masked replay) runs under
 * legitimate interest and is not gated here.
 */
export const useConsentStore = create<ConsentStore>()(
  persist(
    (set) => ({
      analyticsConsent: null,
      setAnalyticsConsent: (analyticsConsent) => set({ analyticsConsent }),
      resetAnalyticsConsent: () => set({ analyticsConsent: null }),
    }),
    { name: `${PRODUCT_NAMESPACE}-consent` },
  ),
);

/** Imperative read for non-React callers (the boot sequence). */
export function hasAnalyticsConsent(): boolean {
  return useConsentStore.getState().analyticsConsent === 'granted';
}
