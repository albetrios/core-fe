import { useLocation } from '@tanstack/react-router';
import { type ReactNode, useRef } from 'react';

import { useReplayedAnimation } from './useReplayedAnimation.ts';

interface PageTransitionProps {
  children: ReactNode;
}

/** The keyframe class. Added imperatively so React never fights over it. */
const ROUTE_ANIMATION_CLASS = 'animate-fade-in-up';

/**
 * Wraps the route `<Outlet />` and plays a single, subtle fade + rise whenever
 * the path changes. Uses transform-only `route-rise` (no opacity fade) so copy
 * stays visible if animation is skipped or reduced-motion overrides duration.
 *
 * The animation restarts on the SAME element — see {@link useReplayedAnimation}
 * for why a `key` is the wrong tool and what it used to cost here (SHELL-6).
 */
export function PageTransition({ children }: PageTransitionProps) {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useReplayedAnimation(ref, ROUTE_ANIMATION_CLASS, pathname);

  return (
    <div ref={ref} data-route={pathname} className="text-foreground">
      {children}
    </div>
  );
}
