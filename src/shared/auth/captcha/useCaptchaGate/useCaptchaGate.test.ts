import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const turnstileReadyRef = vi.hoisted(() => ({ value: false }));
vi.mock('@/shared/auth/captcha/useTurnstileReady/index.ts', () => ({
  useTurnstileReady: () => turnstileReadyRef.value,
}));

const resetMock = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/shared/auth/captcha/turnstile-token-store.ts', () => ({
  requestTurnstileReset: resetMock,
}));

import { CAPTCHA_REMINT_STALL_MS } from '@/shared/auth/captcha/captcha.constants.ts';

import { useCaptchaGate } from './useCaptchaGate.ts';

describe('useCaptchaGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMock.mockClear();
    turnstileReadyRef.value = false;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is ready and never stalls while a token exists', () => {
    turnstileReadyRef.value = true;
    const { result } = renderHook(() => useCaptchaGate());

    expect(result.current.ready).toBe(true);
    act(() => {
      vi.advanceTimersByTime(CAPTCHA_REMINT_STALL_MS * 3);
    });
    expect(result.current.stalled).toBe(false);
  });

  // LOGIN-4: the re-mint after a consumed token is fire-and-forget, so a widget
  // that never calls back leaves every gated action blocked with nothing in flight.
  it('reports stalled once the mint has not landed in time', () => {
    const { result } = renderHook(() => useCaptchaGate());

    expect(result.current.stalled).toBe(false);
    act(() => {
      vi.advanceTimersByTime(CAPTCHA_REMINT_STALL_MS - 1);
    });
    expect(result.current.stalled).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current.stalled).toBe(true);
  });

  it('clears the stall as soon as a token arrives', () => {
    const { result, rerender } = renderHook(() => useCaptchaGate());
    act(() => {
      vi.advanceTimersByTime(CAPTCHA_REMINT_STALL_MS + 10);
    });
    expect(result.current.stalled).toBe(true);

    turnstileReadyRef.value = true;
    rerender();
    expect(result.current.ready).toBe(true);
    expect(result.current.stalled).toBe(false);
  });

  it('retry asks the widget to solve again and clears the stall', () => {
    const { result } = renderHook(() => useCaptchaGate());
    act(() => {
      vi.advanceTimersByTime(CAPTCHA_REMINT_STALL_MS + 10);
    });
    expect(result.current.stalled).toBe(true);

    act(() => {
      expect(result.current.retry()).toBe(true);
    });
    expect(resetMock).toHaveBeenCalledOnce();
    expect(result.current.stalled).toBe(false);
  });

  // LOGIN-4 follow-up: clearing `stalled` on retry is only half an escape hatch. A
  // retry that does not revive the widget has to time out again, or the user is back
  // on an indefinite "preparing…" with no second alert and no second way out.
  it('stalls again when a retry does not bring the widget back', () => {
    const { result } = renderHook(() => useCaptchaGate());
    act(() => {
      vi.advanceTimersByTime(CAPTCHA_REMINT_STALL_MS + 10);
    });
    expect(result.current.stalled).toBe(true);

    act(() => {
      expect(result.current.retry()).toBe(true);
    });
    expect(result.current.stalled).toBe(false);

    // Nothing mints a token, so the widget is exactly as dead as before: the second
    // wait must be timed like the first rather than left running forever.
    act(() => {
      vi.advanceTimersByTime(CAPTCHA_REMINT_STALL_MS + 10);
    });
    expect(result.current.stalled).toBe(true);

    // And the offer survives repetition — the third episode is timed too.
    act(() => {
      expect(result.current.retry()).toBe(true);
    });
    expect(resetMock).toHaveBeenCalledTimes(2);
    expect(result.current.stalled).toBe(false);
    act(() => {
      vi.advanceTimersByTime(CAPTCHA_REMINT_STALL_MS + 10);
    });
    expect(result.current.stalled).toBe(true);
  });

  // The re-armed timer must not outlive the hook: an unmount mid-episode has to take
  // the pending timeout with it rather than leave it firing at a dead component.
  it('leaves no timer behind when unmounted mid-wait, before or after a retry', () => {
    const { result, unmount } = renderHook(() => useCaptchaGate());
    act(() => {
      vi.advanceTimersByTime(CAPTCHA_REMINT_STALL_MS + 10);
    });
    act(() => {
      expect(result.current.retry()).toBe(true);
    });
    // The retry re-armed a timer, so there is something to leak.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports false from retry when no widget is mounted to ask', () => {
    resetMock.mockReturnValueOnce(false);
    const { result } = renderHook(() => useCaptchaGate());
    act(() => {
      expect(result.current.retry()).toBe(false);
    });
  });
});
