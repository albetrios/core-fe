import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IDLE_PREFETCH_TIMEOUT_MS,
  isAuthenticatedAppSurface,
  scheduleIdleChunkPrefetch,
} from './chunk-prefetch.ts';

vi.mock('@/lib/app-splash.ts', () => ({
  // Run the after-paint callback synchronously so tests control the timeline.
  afterPaint: (cb: () => void) => cb(),
}));

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

describe('isAuthenticatedAppSurface', () => {
  it('is false while auth is loading or signed out', () => {
    expect(isAuthenticatedAppSurface('/dashboard', true, true)).toBe(false);
    expect(isAuthenticatedAppSurface('/dashboard', false, false)).toBe(false);
  });

  it('is false on every auth-funnel prefix, including subpaths', () => {
    for (const path of [
      '/login',
      '/onboarding',
      '/callback',
      '/mfa',
      '/accept-invite',
      '/accept-invite/inv_123',
    ]) {
      expect(isAuthenticatedAppSurface(path, true, false)).toBe(false);
    }
  });

  it('is true on signed-in app surfaces', () => {
    expect(isAuthenticatedAppSurface('/dashboard', true, false)).toBe(true);
    expect(isAuthenticatedAppSurface('/organization/acme/dashboard', true, false)).toBe(
      true,
    );
    // A path that merely CONTAINS a funnel word is not a funnel.
    expect(isAuthenticatedAppSurface('/loginaudit', true, false)).toBe(true);
  });
});

describe('scheduleIdleChunkPrefetch', () => {
  const rafSpy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as IdleWindow).requestIdleCallback;
    delete (window as IdleWindow).cancelIdleCallback;
  });

  it('prefetches via requestIdleCallback when the browser provides it', () => {
    const importFn = vi.fn().mockResolvedValue({});
    const idleCallbacks: Array<() => void> = [];
    (window as IdleWindow).requestIdleCallback = (cb, opts) => {
      expect(opts?.timeout).toBe(IDLE_PREFETCH_TIMEOUT_MS);
      idleCallbacks.push(cb);
      return 7;
    };

    scheduleIdleChunkPrefetch(importFn);
    expect(importFn).not.toHaveBeenCalled();

    idleCallbacks[0]?.();
    expect(importFn).toHaveBeenCalledTimes(1);
  });

  it('falls back to a 2s timeout without requestIdleCallback', () => {
    const importFn = vi.fn().mockResolvedValue({});

    scheduleIdleChunkPrefetch(importFn);
    expect(importFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(importFn).toHaveBeenCalledTimes(1);
  });

  it('cancel stops a pending prefetch on both paths', () => {
    const importFn = vi.fn().mockResolvedValue({});
    const cancelIdle = vi.fn();
    let idleCb: (() => void) | undefined;
    (window as IdleWindow).requestIdleCallback = (cb) => {
      idleCb = cb;
      return 9;
    };
    (window as IdleWindow).cancelIdleCallback = cancelIdle;

    const cancel = scheduleIdleChunkPrefetch(importFn);
    cancel();
    expect(cancelIdle).toHaveBeenCalledWith(9);
    idleCb?.(); // even if the browser still fires it, the run is a no-op
    expect(importFn).not.toHaveBeenCalled();

    // Timeout fallback path.
    delete (window as IdleWindow).requestIdleCallback;
    const cancel2 = scheduleIdleChunkPrefetch(importFn);
    cancel2();
    vi.advanceTimersByTime(5000);
    expect(importFn).not.toHaveBeenCalled();
  });

  it('swallows a failed chunk import', async () => {
    const importFn = vi.fn().mockRejectedValue(new Error('offline'));

    scheduleIdleChunkPrefetch(importFn);
    vi.advanceTimersByTime(2000);
    await vi.runAllTimersAsync();

    expect(importFn).toHaveBeenCalledTimes(1); // and no unhandled rejection
  });

  it('a cancel issued before the animation frame stops the schedule', () => {
    const importFn = vi.fn().mockResolvedValue({});
    let frameCb: FrameRequestCallback | undefined;
    rafSpy.mockImplementationOnce((cb: FrameRequestCallback) => {
      frameCb = cb; // hold the frame so cancel can land first
      return 1;
    });

    const cancel = scheduleIdleChunkPrefetch(importFn);
    cancel();
    frameCb?.(0);

    vi.advanceTimersByTime(10_000);
    expect(importFn).not.toHaveBeenCalled();
  });
});
