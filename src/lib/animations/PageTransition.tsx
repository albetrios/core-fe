import { useLocation } from '@tanstack/react-router';
import { type ReactNode, useLayoutEffect, useRef } from 'react';

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

  /*
   * Layout effect, not a passive one. `useEffect` runs AFTER the browser has
   * painted, so the commit that swapped in the new route painted one frame with
   * no animation class on the node: the page showed up at its resting position
   * and then snapped back to the animation's first keyframe on the next frame.
   * That one-frame snap is the route-change flicker.
   *
   * `useLayoutEffect` runs inside the same commit, before paint, so the first
   * frame the user ever sees is already frame 0 of the animation.
   *
   * No isomorphic-layout-effect guard, and none exists in this repo to reuse:
   * React only warns about `useLayoutEffect` while rendering on the server, and
   * nothing here renders on the server — `main.tsx` is a client `createRoot`
   * SPA with no `react-dom/server` anywhere, and the unit suite runs in jsdom,
   * which is a DOM environment. Every other layout effect in the codebase is
   * called bare for the same reason (`useOnboardingStepMotion`,
   * `SettingsModal`, `SettingsModalLazy`).
   */
  useLayoutEffect(() => {
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
