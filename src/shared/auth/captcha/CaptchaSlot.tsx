import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';

import { getCaptchaSlot, setCaptchaSlot } from './captcha-slot.ts';

/**
 * Inline anchor the app-global {@link InvisibleTurnstile} portals its challenge into.
 * Mount one per auth surface. The most recently mounted slot wins, and unmounting only
 * clears the registration when this slot is still the registered one — so a newer slot
 * mounted before an older one unmounts is not knocked out by the older cleanup.
 */
export function CaptchaSlot({
  testId,
  className,
}: {
  testId?: string;
  className?: string;
}): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setCaptchaSlot(element);
    return () => {
      if (getCaptchaSlot() === element) {
        setCaptchaSlot(null);
      }
    };
  }, []);

  return <div ref={ref} className={className} data-testid={testId} />;
}
