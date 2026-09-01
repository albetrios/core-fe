import { useEffect, useState } from 'react';

import { prefersReducedMotion } from '@/lib/animations/index.ts';

/**
 * Flips to `true` one frame after mount so CSS transitions can animate from an
 * initial state (opacity/transform/stroke-dashoffset/progress values). Starts
 * `true` under reduced motion so everything renders settled with no animation.
 */
export function useRevealOnMount(): boolean {
  const [revealed, setRevealed] = useState(() => prefersReducedMotion());
  useEffect(() => {
    if (revealed) return undefined;
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [revealed]);
  return revealed;
}

/** Class-based stagger delays (no inline styles) for list entrances. */
const STAGGER_DELAYS = [
  'delay-[0ms]',
  'delay-[70ms]',
  'delay-[140ms]',
  'delay-[210ms]',
  'delay-[280ms]',
  'delay-[350ms]',
] as const;

/** Delay class for the nth row (clamped to the last step). */
export function staggerDelay(index: number): string {
  return STAGGER_DELAYS[Math.min(index, STAGGER_DELAYS.length - 1)] ?? STAGGER_DELAYS[0];
}

/** Base classes for a reveal-on-mount row (pair with the reveal states). */
export const revealBaseClassName =
  'transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none';

/** Settled state for a revealed row (driven by {@link useRevealOnMount}). */
export const revealShownClassName = 'translate-y-0 opacity-100';

/** Initial hidden state for a not-yet-revealed row. */
export const revealHiddenClassName = 'translate-y-2 opacity-0';
