import { useLocation } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef } from 'react';

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
 * The animation restarts on the SAME element. It used to be replayed with
 * `key={pathname}`, which is not a transition at all — a changed key throws the
 * element away and mounts a new one, so every widget below it remounts. That
 * cost a chart range, a calendar selection and a carousel position on every
 * route change, and the content region flashed empty on the way through
 * (SHELL-6). Nothing about replaying a CSS animation requires destroying the
 * subtree that is being animated.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove(ROUTE_ANIMATION_CLASS);
    // Reading layout forces a reflow. Without it the browser coalesces the
    // remove + add into no change at all and the animation never replays.
    el.getBoundingClientRect();
    el.classList.add(ROUTE_ANIMATION_CLASS);
  }, [pathname]);

  return (
    <div ref={ref} data-route={pathname} className="text-foreground">
      {children}
    </div>
  );
}
