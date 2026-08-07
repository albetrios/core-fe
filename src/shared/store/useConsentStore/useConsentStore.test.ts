import { beforeEach, describe, expect, it } from 'vitest';

import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';

import { hasAnalyticsConsent, useConsentStore } from './useConsentStore.ts';

describe('useConsentStore', () => {
  beforeEach(() => {
    useConsentStore.getState().resetAnalyticsConsent();
    localStorage.clear();
  });

  it('starts undecided (banner should show, analytics off)', () => {
    expect(useConsentStore.getState().analyticsConsent).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('grants consent', () => {
    useConsentStore.getState().setAnalyticsConsent('granted');
    expect(useConsentStore.getState().analyticsConsent).toBe('granted');
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it('denies consent (stays off)', () => {
    useConsentStore.getState().setAnalyticsConsent('denied');
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('persists the decision to localStorage', () => {
    useConsentStore.getState().setAnalyticsConsent('granted');
    expect(localStorage.getItem(`${PRODUCT_NAMESPACE}-consent`)).toContain('granted');
  });

  it('reset returns to undecided', () => {
    useConsentStore.getState().setAnalyticsConsent('denied');
    useConsentStore.getState().resetAnalyticsConsent();
    expect(useConsentStore.getState().analyticsConsent).toBeNull();
  });
});
