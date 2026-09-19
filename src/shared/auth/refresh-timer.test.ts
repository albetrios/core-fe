import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/auth/service.ts', () => ({
  silentRefresh: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/auth/token.ts', () => ({
  getTokenExpiry: vi.fn().mockReturnValue(null),
}));

import { silentRefresh } from '@/shared/auth/service.ts';
import { getTokenExpiry } from '@/shared/auth/token.ts';

import {
  cancelTokenRefresh,
  hasDeferredVisibilityListener,
  scheduleTokenRefresh,
} from './refresh-timer.ts';

/** Drive the tab hidden/visible the way the browser does. */
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Overrides `document.hidden` (read-only in jsdom) for the defer-path tests. */
function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

describe('refresh-timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cancelTokenRefresh();
    vi.mocked(silentRefresh).mockClear();
  });

  afterEach(() => {
    cancelTokenRefresh();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does nothing when no token expiry exists', () => {
    vi.mocked(getTokenExpiry).mockReturnValue(null);
    scheduleTokenRefresh();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('schedules a refresh before token expiry', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 300; // 5 min from now
    vi.mocked(getTokenExpiry).mockReturnValue(futureExp);

    scheduleTokenRefresh();

    // A timer should have been scheduled (240s = 300s - 60s buffer)
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('cancelTokenRefresh clears pending timer', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 300;
    vi.mocked(getTokenExpiry).mockReturnValue(futureExp);

    scheduleTokenRefresh();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    cancelTokenRefresh();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('calling scheduleTokenRefresh twice replaces the previous timer', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 300;
    vi.mocked(getTokenExpiry).mockReturnValue(futureExp);

    scheduleTokenRefresh();
    const count1 = vi.getTimerCount();

    scheduleTokenRefresh();
    const count2 = vi.getTimerCount();

    expect(count2).toBe(count1);
  });

  describe('the deferred visibility listener (X-7)', () => {
    // Firing against a hidden tab defers the refresh until the tab comes back.
    // That listener used to outlive the session: cancelTokenRefresh cleared the
    // timer id and nothing else, so after logout the next focus ran a refresh
    // for a dead session — against a backend that treats refresh reuse as an
    // attack — and a listener accumulated per login/logout cycle.
    function deferUntilVisible() {
      const futureExp = Math.floor(Date.now() / 1000) + 300;
      vi.mocked(getTokenExpiry).mockReturnValue(futureExp);
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      scheduleTokenRefresh();
      vi.runOnlyPendingTimers();
    }

    it('cancelTokenRefresh removes it, so a later focus refreshes nothing', () => {
      vi.mocked(silentRefresh).mockClear();
      deferUntilVisible();
      expect(hasDeferredVisibilityListener()).toBe(true);

      cancelTokenRefresh(); // this is what logout calls
      expect(hasDeferredVisibilityListener()).toBe(false);

      setHidden(false);
      expect(silentRefresh).not.toHaveBeenCalled();
    });

    it('still refreshes when the tab comes back and the session is alive', () => {
      vi.mocked(silentRefresh).mockClear();
      deferUntilVisible();

      setHidden(false);
      expect(silentRefresh).toHaveBeenCalledTimes(1);
      // And it cleans itself up rather than waiting for a cancel.
      expect(hasDeferredVisibilityListener()).toBe(false);
    });

    it('does not stack a listener per login/logout cycle', () => {
      for (let i = 0; i < 3; i += 1) {
        deferUntilVisible();
        cancelTokenRefresh();
      }
      vi.mocked(silentRefresh).mockClear();

      setHidden(false);
      expect(silentRefresh).not.toHaveBeenCalled();
      expect(hasDeferredVisibilityListener()).toBe(false);
    });
  });

  it('enforces minimum delay of 5 seconds', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 10; // already expired
    vi.mocked(getTokenExpiry).mockReturnValue(pastExp);

    scheduleTokenRefresh();

    // Timer should still be set with MIN_DELAY_MS
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('fires silentRefresh when the timer elapses and reschedules for the new token', async () => {
    setDocumentHidden(false);
    const futureExp = Math.floor(Date.now() / 1000) + 300;
    vi.mocked(getTokenExpiry).mockReturnValue(futureExp);
    vi.mocked(silentRefresh).mockResolvedValue(undefined);

    scheduleTokenRefresh();
    await vi.advanceTimersByTimeAsync(240_000); // 300s exp − 60s buffer

    expect(silentRefresh).toHaveBeenCalledTimes(1);
    // Success path reschedules from the (mocked) fresh token's expiry.
    expect(vi.getTimerCount()).toBe(1);
  });

  it('defers the refresh while the tab is hidden and runs it on visibilitychange', async () => {
    setDocumentHidden(true);
    const futureExp = Math.floor(Date.now() / 1000) + 300;
    vi.mocked(getTokenExpiry).mockReturnValue(futureExp);
    vi.mocked(silentRefresh).mockResolvedValue(undefined);

    scheduleTokenRefresh();
    await vi.advanceTimersByTimeAsync(240_000);
    expect(silentRefresh).not.toHaveBeenCalled();

    setDocumentHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0); // flush the deferred refresh promise

    expect(silentRefresh).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed proactive refresh and does not reschedule', async () => {
    setDocumentHidden(false);
    const futureExp = Math.floor(Date.now() / 1000) + 300;
    vi.mocked(getTokenExpiry).mockReturnValue(futureExp);
    vi.mocked(silentRefresh).mockRejectedValue(new Error('refresh down'));

    scheduleTokenRefresh();
    await vi.advanceTimersByTimeAsync(240_000);

    // Failure falls back to the 401 interceptor: no crash, no new timer.
    expect(silentRefresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
