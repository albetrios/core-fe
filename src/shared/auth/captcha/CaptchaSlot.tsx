import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';

import { getCaptchaSlot, setCaptchaSlot } from './captcha-slot.ts';

/**
 * Inline anchor the app-global {@link InvisibleTurnstile} portals its challenge into.
 *
 * @remarks
 * A surface may mount several — one beside each captcha-gated control — but only the
 * one whose `active` is true registers, so the challenge lands at the control the user
 * pressed instead of wherever a slot was last mounted. With a single slot shared by the
 * whole form, a challenge raised by "Continue with Google" appeared down in the email
 * section, in a different part of the form from the button that caused it.
 *
 * Unmounting (or deactivating) only clears the registration when this slot is still the
 * registered one, so a newly activated slot is not knocked out by the outgoing one's
 * cleanup.
 */
export function CaptchaSlot({
  testId,
  className,
  active = true,
}: {
  testId?: string;
  className?: string;
  /** Register this slot as the challenge target. Defaults to true. */
  active?: boolean;
}): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!(element && active)) return;
    setCaptchaSlot(element);
    return () => {
      if (getCaptchaSlot() === element) {
        setCaptchaSlot(null);
      }
    };
  }, [active]);

  return <div ref={ref} className={className} data-testid={testId} />;
}
