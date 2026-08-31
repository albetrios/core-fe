import { useCallback, useEffect, useState } from 'react';

import { CAPTCHA_REMINT_STALL_MS } from '@/shared/auth/captcha/captcha.constants.ts';
import { requestTurnstileReset } from '@/shared/auth/captcha/turnstile-token-store.ts';
import { useTurnstileReady } from '@/shared/auth/captcha/useTurnstileReady/index.ts';

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
  }, [ready]);

  const retry = useCallback(() => {
    setStalled(false);
    return requestTurnstileReset();
  }, []);

  return { ready, stalled, retry };
}
