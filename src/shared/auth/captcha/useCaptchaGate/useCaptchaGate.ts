import { useCallback, useEffect, useState } from 'react';

import { CAPTCHA_REMINT_STALL_MS } from '@/shared/auth/captcha/captcha.constants.ts';
import { requestTurnstileReset } from '@/shared/auth/captcha/turnstile-token-store.ts';
import { useTurnstileReady } from '@/shared/auth/captcha/useTurnstileReady/index.ts';

/**
 * What the auth screens need to know about the captcha they are gated on.
 *
 * `stalled` is deliberately separate from `!ready`: a widget that is merely slow
 * and one that has stopped answering look identical to the user, and only the
 * second deserves an alert with a retry. `retry()` re-arms that watch, so a
 * retry that does not revive the widget stalls again rather than dead-ending on
 * an indefinite "preparing…".
 */
export interface CaptchaGateState {
  /** Public auth actions may proceed (token minted, or the gate is off entirely). */
  ready: boolean;
  /**
   * The gate has been blocking for longer than {@link CAPTCHA_REMINT_STALL_MS}.
   * A normal mint takes a few hundred ms, so this means the widget is not coming
   * back and the user needs to be told rather than left waiting.
   */
  stalled: boolean;
  /** Ask the widget to solve again. `false` when no widget is mounted to ask. */
  retry: () => boolean;
}

/**
 * Readiness of the captcha gate, plus whether it has stalled.
 *
 * Turnstile tokens are single-use: every public auth POST consumes the token and
 * asks the widget to mint another. That re-mint is fire-and-forget, so a widget
 * that never calls back leaves every gated action blocked with nothing in flight —
 * which is how "Verify and continue" ended up spinning and greyed out forever
 * after the code was sent (LOGIN-4). {@link CaptchaGateState.stalled} is the
 * signal the UI needs to stop implying progress and offer a way out.
 */
export function useCaptchaGate(): CaptchaGateState {
  const ready = useTurnstileReady();
  const [stalled, setStalled] = useState(false);
  /**
   * Marks which blocking episode is being timed; {@link retry} bumps it.
   *
   * A retry does not change `ready` — the widget is exactly as absent after it as
   * before — so `ready` alone cannot tell the effect that a new wait has started.
   * Without a dep that moves, the timer never re-armed and a retry that failed to
   * revive the widget left the user on an indefinite "preparing…" with no second
   * alert and no second retry: the escape hatch was one-shot per episode (LOGIN-4).
   */
  const [retryEpoch, setRetryEpoch] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryEpoch is a re-arm signal, not a value the body reads — a retry leaves `ready` unchanged, so dropping it would strand a failed retry on "preparing…" forever with the timer never restarted
  useEffect(() => {
    // While a token exists there is nothing to time, and no flag to hold.
    if (ready) return;
    const timer = setTimeout(() => setStalled(true), CAPTCHA_REMINT_STALL_MS);
    // Reset on the way out rather than on the way in: this effect run IS one
    // blocking episode, so ending it — a token arriving, or a retry — ends the
    // stall with it. Clearing it in the body instead would be a synchronous
    // setState inside an effect, and would cascade a render on every mint.
    return () => {
      clearTimeout(timer);
      setStalled(false);
    };
    // `retryEpoch` is here so a retry tears this run down and starts a fresh one.
  }, [ready, retryEpoch]);

  const retry = useCallback(() => {
    // Clear the flag in the same batch as the click so the alert goes away at once,
    // and start a new episode so this wait is timed too. Clearing alone was the bug:
    // it silenced the alert forever instead of re-opening it when the retry failed.
    setStalled(false);
    setRetryEpoch((epoch) => epoch + 1);
    return requestTurnstileReset();
  }, []);

  return { ready, stalled, retry };
}
