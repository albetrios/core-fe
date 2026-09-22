import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setTurnstileToken } from '@/shared/auth/captcha/turnstile-token-store.ts';

import { useCaptchaIntent } from './useCaptchaIntent.ts';

const { gateActive } = vi.hoisted(() => ({ gateActive: { value: true } }));
vi.mock('@/shared/auth/captcha/captcha-config.ts', () => ({
  isTurnstileCaptchaGateActive: () => gateActive.value,
}));

/**
 * The click carries the captcha wait so the button never has to be disabled.
 * These pin the two halves of that bargain: the action really is blocked until a
 * token exists, and the challenge really is anchored to the control that asked.
 */
describe('useCaptchaIntent', () => {
  beforeEach(() => {
    gateActive.value = true;
    setTurnstileToken(undefined);
  });

  afterEach(() => {
    setTurnstileToken(undefined);
    vi.useRealTimers();
  });

  it('proceeds at once when a token is already stored', async () => {
    setTurnstileToken('tok');
    const { result } = renderHook(() => useCaptchaIntent());

    await expect(result.current.ensureToken('email-send')).resolves.toBe(true);
    expect(result.current.challengeFor).toBeNull();
  });

  it('proceeds at once, and shows nothing, when captcha is switched off', async () => {
    gateActive.value = false;
    const { result } = renderHook(() => useCaptchaIntent());

    await expect(result.current.ensureToken('email-send')).resolves.toBe(true);
    expect(result.current.challengeFor).toBeNull();
  });

  // The point of the redesign: blocked, but blocked with the reason on screen.
  it('blocks the action and anchors the challenge to the control that asked', async () => {
    const { result } = renderHook(() => useCaptchaIntent());

    let settled: boolean | undefined;
    act(() => {
      void result.current.ensureToken('oauth:google').then((value) => {
        settled = value;
      });
    });

    await waitFor(() => expect(result.current.challengeFor).toBe('oauth:google'));
    expect(settled).toBeUndefined();
  });

  it('completes the action when the challenge is solved, and clears the challenge', async () => {
    const { result } = renderHook(() => useCaptchaIntent());

    let settled: boolean | undefined;
    act(() => {
      void result.current.ensureToken('email-verify').then((value) => {
        settled = value;
      });
    });
    await waitFor(() => expect(result.current.challengeFor).toBe('email-verify'));

    act(() => setTurnstileToken('solved'));

    await waitFor(() => expect(settled).toBe(true));
    expect(result.current.challengeFor).toBeNull();
  });

  it('gives up, and takes the challenge away, when it is never completed', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCaptchaIntent());

    let settled: boolean | undefined;
    act(() => {
      void result.current.ensureToken('email-send').then((value) => {
        settled = value;
      });
    });
    expect(result.current.challengeFor).toBe('email-send');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(130_000);
    });

    expect(settled).toBe(false);
    expect(result.current.challengeFor).toBeNull();
  });

  // Two clicks race the same single-use token; the loser would clear the
  // challenge out from under the winner.
  it('refuses a second wait while one is open', async () => {
    const { result } = renderHook(() => useCaptchaIntent());

    act(() => {
      void result.current.ensureToken('email-send');
    });
    await waitFor(() => expect(result.current.challengeFor).toBe('email-send'));

    await expect(result.current.ensureToken('oauth:google')).resolves.toBe(false);
    expect(result.current.challengeFor).toBe('email-send');
  });
});
