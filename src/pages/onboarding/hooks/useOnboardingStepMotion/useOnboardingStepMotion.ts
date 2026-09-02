import { animate, createTimeline, cubicBezier } from 'animejs';
import { useLayoutEffect, useRef } from 'react';

import { prefersReducedMotion } from '@/lib/animations/prefers-reduced-motion.ts';

import { ONBOARDING_MOTION } from '../../onboarding.constants.ts';

/** Strong ease-out — entering wizard steps (Emil: responsive, not ease-in). */
const EASE_STEP_ENTER = cubicBezier(0.23, 1, 0.32, 1);

/** iOS-like settle for the card shell (drawer curve). */
const EASE_CARD_ENTER = cubicBezier(0.32, 0.72, 0, 1);

/** Settle element at rest so Strict Mode remounts never flash mid-animation. */
function settleMotionTarget(el: HTMLElement | null) {
  if (!el) return;
  el.style.opacity = '';
  el.style.transform = '';
}

/**
 * First-run wizard motion: soft card entrance, then **vertical** step transitions
 * (no horizontal slide). Forward steps rise into place; back steps ease down
 * slightly — spatial consistency for a top-to-bottom wizard, not a carousel.
 */
export function useOnboardingStepMotion(stepIndex: number) {
  const cardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const stepBodyRef = useRef<HTMLDivElement>(null);
  const prevStepIndex = useRef(stepIndex);
  const cardEntranceDone = useRef(false);
  const stepMotionPrimed = useRef(false);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || prefersReducedMotion()) return;

    if (cardEntranceDone.current) {
      settleMotionTarget(card);
      return;
    }

    /*
     * Marked done when the animation FINISHES, not when it starts.
     *
     * Setting it up front meant Strict Mode's second mount always took the
     * branch above: run 1 started the entrance and its cleanup paused it, run 2
     * saw the flag and settled the card at rest. The entrance therefore never
     * played in development — invisible in production, but it made the one
     * animation on this screen impossible to iterate on locally (ONB-12).
     *
     * Leaving the flag false until completion lets the second mount replay it,
     * while a genuine later remount still settles instead of re-animating.
     */
    const animation = animate(card, {
      translateY: [ONBOARDING_MOTION.cardOffsetY, 0],
      scale: [ONBOARDING_MOTION.cardScaleFrom, 1],
      duration: ONBOARDING_MOTION.cardDurationMs,
      ease: EASE_CARD_ENTER,
      onComplete: () => {
        cardEntranceDone.current = true;
      },
    });

    return () => {
      animation.pause();
      settleMotionTarget(card);
    };
  }, []);

  useLayoutEffect(() => {
    if (!stepMotionPrimed.current) {
      stepMotionPrimed.current = true;
      prevStepIndex.current = stepIndex;
      return;
    }

    if (stepIndex === prevStepIndex.current) return;

    const forward = stepIndex > prevStepIndex.current;
    prevStepIndex.current = stepIndex;

    if (prefersReducedMotion()) return;

    const header = headerRef.current;
    const body = stepBodyRef.current;
    if (!(header || body)) return;

    const fromY = forward
      ? ONBOARDING_MOTION.stepOffsetYForward
      : ONBOARDING_MOTION.stepOffsetYBack;

    const stepIn = {
      translateY: [fromY, 0],
      opacity: [ONBOARDING_MOTION.stepOpacityFrom, 1],
      scale: [ONBOARDING_MOTION.stepScaleFrom, 1],
    };

    const timeline = createTimeline({
      defaults: {
        ease: EASE_STEP_ENTER,
        duration: ONBOARDING_MOTION.stepDurationMs,
      },
    });

    if (header) {
      timeline.add(header, stepIn, 0);
    }

    if (body) {
      timeline.add(body, stepIn, ONBOARDING_MOTION.stepBodyDelayMs);
    }

    return () => {
      timeline.pause();
      settleMotionTarget(header);
      settleMotionTarget(body);
    };
  }, [stepIndex]);

  return { cardRef, headerRef, stepBodyRef };
}
