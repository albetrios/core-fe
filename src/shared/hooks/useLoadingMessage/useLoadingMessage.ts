import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { prefersReducedMotion } from '@/lib/animations/index.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';

/**
 * How long each line holds before the next one replaces it.
 *
 * The same 1.6s {@link WorkspaceSwitchOverlay} uses, and for the same reason:
 * long enough to read, short enough that the screen is visibly doing something.
 * A fast query never gets past the first line, which is the intended behaviour —
 * the later lines exist for the slow case, not as a sequence everyone sits
 * through.
 */
const MESSAGE_INTERVAL_MS = 1_600;

/** The lines, in the order the wait actually happens. */
const STAGE_KEYS = [LOCALE_KEYS.loadingStill, LOCALE_KEYS.loadingAlmost] as const;

/**
 * A loading line that advances while the wait continues, so a slow surface
 * looks alive rather than stalled.
 *
 * @remarks
 * - **Algorithm:** starts on a line naming what is loading ("Loading Members…",
 *   or a plain "Loading…" when the caller names nothing), then steps through
 *   {@link STAGE_KEYS} every {@link MESSAGE_INTERVAL_MS}. It **stops on the last
 *   line** rather than looping: cycling back to "Loading…" after "Almost there"
 *   reads as a stall, and by then the honest signal is that it is taking a while.
 * - **Reduced motion:** the rotation is skipped entirely and the first line
 *   stays. The movement is decoration; the information — what is loading — is
 *   already in that first line.
 * - **Side effects:** one interval while `active`, cleared on unmount and
 *   whenever `active` goes false.
 *
 * Every line is a translation key, so this never renders an English string
 * into a non-English UI.
 *
 * @param name - What is being fetched ("Members", "Billing"). Optional.
 * @param active - Whether the wait is still running. Pass `false` to freeze it.
 * @returns The translated line to show right now.
 */
export function useLoadingMessage(name?: string, active = true): string {
  const { t } = useTranslation(LOCALE_NS);
  const [stage, setStage] = useState(0);

  // A different thing is being loaded: start its wait from the top rather than
  // inheriting the previous one's "Almost there". Adjusting state during render
  // when an input changed is the pattern React documents for this.
  const [stageFor, setStageFor] = useState(name);
  if (stageFor !== name) {
    setStageFor(name);
    setStage(0);
  }

  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) return;
    const timer = setInterval(() => {
      setStage((current) => Math.min(current + 1, STAGE_KEYS.length));
    }, MESSAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);

  if (stage === 0) {
    return name ? t(LOCALE_KEYS.loadingNamed, { name }) : `${t(LOCALE_KEYS.loading)}…`;
  }

  return t(STAGE_KEYS[stage - 1] ?? STAGE_KEYS[0]);
}
