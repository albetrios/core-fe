import { animate } from 'animejs';
import { type RefObject, useEffect, useRef } from 'react';

import { prefersReducedMotion } from '@/lib/animations/prefers-reduced-motion.ts';

/**
 * Count-up via Anime.js — the only motion on the dashboard (object tween + outExpo).
 *
 * Writes each frame straight to the returned element's `textContent` instead of
 * through React state. Driving the tween with `setState` re-rendered the tile on
 * every frame (~43 renders per mount), and — because Anime.js ticks on a shared
 * frame loop — a tick could land while another component was rendering, which
 * React reports as "Cannot update a component (`DashboardKpiTile`) while
 * rendering a different component (`CartesianGrid`)". The animation is purely
 * visual, so it belongs on the DOM node, not in the render cycle.
 *
 * Render the FINAL formatted value as the element's children: that is what shows
 * before the effect runs, under reduced motion, and after any later re-render.
 * The tween only overwrites the text while it is in flight.
 *
 * @param target - Final value, or `null` for non-numeric content (no animation).
 * @param format - Formats each in-flight frame value (locale-aware at the call site).
 * @param durationMs - Tween duration.
 * @returns Ref to attach to the element whose text should count up.
 */
export function useAnimeCountUp<T extends HTMLElement = HTMLElement>(
  target: number | null,
  format: (value: number) => string,
  durationMs = 720,
): RefObject<T | null> {
  const elementRef = useRef<T | null>(null);
  // Read through a ref so a new inline formatter each render can't restart the tween.
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  });

  useEffect(() => {
    const element = elementRef.current;
    // Nothing to animate: React already rendered the final value as children.
    if (element === null || target === null || target === 0 || prefersReducedMotion()) {
      return;
    }

    const state = { val: 0 };
    const animation = animate(state, {
      val: target,
      duration: durationMs,
      ease: 'outExpo',
      onUpdate: () => {
        element.textContent = formatRef.current(state.val);
      },
      onComplete: () => {
        // Hand the node back to React's value so the two can never disagree.
        element.textContent = formatRef.current(target);
      },
    });

    return () => {
      animation.pause();
      element.textContent = formatRef.current(target);
    };
  }, [target, durationMs]);

  return elementRef;
}
