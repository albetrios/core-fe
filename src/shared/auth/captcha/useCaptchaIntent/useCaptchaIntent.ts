import { useCallback, useRef, useState } from 'react';

import { CAPTCHA_CHALLENGE_WAIT_MS } from '@/shared/auth/captcha/captcha.constants.ts';
import { isTurnstileCaptchaGateActive } from '@/shared/auth/captcha/captcha-config.ts';
import {
  peekTurnstileToken,
  requestTurnstileReset,
  waitForTurnstileToken,
} from '@/shared/auth/captcha/turnstile-token-store.ts';

export interface CaptchaIntentState {
  /**
   * The control whose challenge is showing, or `null`. A slot renders only when
   * this matches its own key, so the challenge always appears at the button the
   * user actually pressed rather than wherever a slot happened to be mounted.
   */
  challengeFor: string | null;
  /**
   * Resolve a captcha token for `key`, revealing a challenge at that control if
   * one is demanded. `true` means the caller may proceed.
   */
  ensureToken: (key: string) => Promise<boolean>;
}

/**
 * Take a click on a captcha-gated control and resolve the captcha inside it.
 *
 * @remarks
 * - **Why:** the gated buttons used to sit `disabled` until a token existed. With
 *   `pointer-events: none` that is a control the user cannot press, cannot hover
 *   for an explanation and cannot reach with a keyboard, for a check they never
 *   started — and when both sign-in methods were gated on the same token, a single
 *   slow widget closed every route into the product at once.
 * - **Algorithm:** a token already in the store returns `true` at once, which is
 *   the overwhelmingly common path and costs nothing. Otherwise the control's
 *   challenge is revealed immediately and the click waits up to
 *   {@link CAPTCHA_CHALLENGE_WAIT_MS} for it to be completed. The action is blocked
 *   throughout — it simply blocks with the reason on screen instead of silently.
 * - **Failure modes:** none raised. A wait that times out resolves `false` and the
 *   caller declines to act; the challenge is cleared either way.
 * - **Side effects:** sets {@link CaptchaIntentState.challengeFor} while waiting.
 *
 * Captcha being switched off resolves `true` without touching any of this.
 */
export function useCaptchaIntent(): CaptchaIntentState {
  const [challengeFor, setChallengeFor] = useState<string | null>(null);
  // A second click while one wait is open must not start another: both would race
  // the same single token, and the loser would clear the challenge out from under
  // the winner.
  const waitingRef = useRef(false);

  const ensureToken = useCallback(async (key: string) => {
    if (!isTurnstileCaptchaGateActive()) return true;
    if (peekTurnstileToken()) return true;
    if (waitingRef.current) return false;

    waitingRef.current = true;
    // Shown straight away rather than after a grace period: the slot is empty
    // unless Cloudflare actually escalated, so revealing it early cannot flash an
    // empty box — and when there IS a challenge, every millisecond it stays hidden
    // is a millisecond the user spends wondering why nothing happened.
    setChallengeFor(key);
    try {
      const solved = await waitForTurnstileToken(CAPTCHA_CHALLENGE_WAIT_MS);
      // An abandoned challenge leaves the widget mid-ceremony. Asking for a fresh
      // one means the next click starts from a clean widget rather than waiting
      // out a second timeout against the same stuck instance.
      if (!solved) requestTurnstileReset();
      return solved;
    } finally {
      waitingRef.current = false;
      setChallengeFor(null);
    }
  }, []);

  return { challengeFor, ensureToken };
}
