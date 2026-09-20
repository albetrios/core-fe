import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';

import {
  clearSessionStart,
  getSessionAge,
  hasSessionHint,
  isSessionExpired,
  markSessionStart,
  startSessionLifetimeWatch,
} from './session-lifetime.ts';

// Derived, not hardcoded: a renamed product uses its own namespace, and a literal
// here would assert the previous brand's key.
const KEY = `${PRODUCT_NAMESPACE}:session-started-at`;

describe('session-lifetime', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('hasSessionHint — which chunks the boot warms, never who may enter', () => {
    it('is false for a browser that has never signed in', () => {
      expect(hasSessionHint()).toBe(false);
    });

    it('is true from an interactive sign-in until logout', () => {
      markSessionStart();
      expect(hasSessionHint()).toBe(true);

      clearSessionStart();
      expect(hasSessionHint()).toBe(false);
    });

    it('stays true for an old session — age is the cap’s business, not the hint’s', () => {
      markSessionStart();
      vi.setSystemTime(Date.now() + 30 * 24 * 60 * 60 * 1000);

      expect(hasSessionHint()).toBe(true);
    });

    it('is false for a stamp that is not a number', () => {
      localStorage.setItem(KEY, 'not-a-timestamp');

      expect(hasSessionHint()).toBe(false);
    });

    it('is false when storage is unavailable', () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(hasSessionHint()).toBe(false);
      getItem.mockRestore();
    });
  });

  it('records and forgets the session start', () => {
    expect(getSessionAge()).toBeNull();
    markSessionStart();
    expect(localStorage.getItem(KEY)).toBeTruthy();
    expect(getSessionAge()).toBe(0);
    clearSessionStart();
    expect(getSessionAge()).toBeNull();
  });

  it('reports expiry once the cap elapses', () => {
    markSessionStart();
    expect(isSessionExpired(1000)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(isSessionExpired(1000)).toBe(true);
  });

  it('never expires when no session start is recorded', () => {
    expect(isSessionExpired(1)).toBe(false);
  });

  it('fires the watchdog exactly once when the cap is crossed', () => {
    markSessionStart();
    const onExpire = vi.fn();
    const stop = startSessionLifetimeWatch(onExpire, 5000, 1000);

    vi.advanceTimersByTime(4000);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000); // now past 5000
    expect(onExpire).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000); // interval cleared — no second call
    expect(onExpire).toHaveBeenCalledTimes(1);
    stop();
  });

  it('fires immediately when already expired at watch start', () => {
    markSessionStart();
    vi.advanceTimersByTime(10_000);
    const onExpire = vi.fn();
    const stop = startSessionLifetimeWatch(onExpire, 5000, 1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    stop();
  });

  it('tolerates a corrupt stored value', () => {
    localStorage.setItem(KEY, 'not-a-number');
    expect(getSessionAge()).toBeNull();
    expect(isSessionExpired()).toBe(false);
  });
});
