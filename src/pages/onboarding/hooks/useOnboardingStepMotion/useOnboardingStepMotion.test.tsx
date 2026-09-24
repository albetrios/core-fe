import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingStep } from '@/shared/store/useOnboardingStore/index.ts';

const { animateMock, createTimelineMock } = vi.hoisted(() => ({
  animateMock: vi.fn((_el: unknown, _params: unknown) => ({ pause: vi.fn() })),
  createTimelineMock: vi.fn(() => ({
    add: vi.fn().mockReturnThis(),
    pause: vi.fn(),
  })),
}));

vi.mock('animejs', () => ({
  animate: animateMock,
  createTimeline: createTimelineMock,
  cubicBezier: () => (t: number) => t,
}));

import { useOnboardingStepMotion } from './useOnboardingStepMotion.ts';

function MotionHarness({ index, step }: { index: number; step: OnboardingStep }) {
  const { cardRef, headerRef, stepBodyRef } = useOnboardingStepMotion(index, step);
  return (
    <div>
      <div ref={cardRef} data-testid="card" />
      <div ref={headerRef} data-testid="header" />
      <div ref={stepBodyRef} data-testid="body" />
    </div>
  );
}

describe('useOnboardingStepMotion', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('plays card entrance and step timeline when motion is allowed', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const { rerender, unmount } = render(
      <StrictMode>
        <MotionHarness index={0} step="welcome" />
      </StrictMode>,
    );
    /*
     * ONB-12. Strict Mode mounts twice: run 1 starts the entrance and its
     * cleanup pauses it, run 2 is the one the user actually sees. The
     * "already done" flag used to be set when the animation STARTED, so run 2
     * took the settle-at-rest branch and the entrance never played in
     * development — two calls here is the fix, not a regression.
     */
    expect(animateMock).toHaveBeenCalledTimes(2);
    // The mechanism: the flag is now flipped by the animation finishing.
    const entranceParams = animateMock.mock.calls.at(-1)?.[1] as
      { onComplete?: () => void } | undefined;
    expect(typeof entranceParams?.onComplete).toBe('function');
    expect(createTimelineMock).not.toHaveBeenCalled();

    rerender(
      <StrictMode>
        <MotionHarness index={1} step="profile" />
      </StrictMode>,
    );
    expect(screen.getByTestId('body')).toBeInTheDocument();
    expect(createTimelineMock).toHaveBeenCalledTimes(1);
    const stepProps =
      createTimelineMock.mock.results[0]?.value?.add?.mock?.calls?.[0]?.[1];
    expect(stepProps).toMatchObject({
      translateY: expect.any(Array),
      opacity: expect.any(Array),
      scale: expect.any(Array),
    });
    expect(stepProps).not.toHaveProperty('translateX');

    unmount();
  });

  it('skips anime when reduced motion is preferred', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    render(<MotionHarness index={0} step="welcome" />);
    expect(animateMock).not.toHaveBeenCalled();
    expect(createTimelineMock).not.toHaveBeenCalled();
  });

  it('plays the card entrance exactly once outside Strict Mode', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    // Production mounts once, so the doubled Strict Mode count above must not
    // mean the user ever sees the entrance twice.
    const { rerender } = render(<MotionHarness index={0} step="welcome" />);
    expect(animateMock).toHaveBeenCalledTimes(1);

    rerender(<MotionHarness index={0} step="welcome" />);
    expect(animateMock).toHaveBeenCalledTimes(1);
  });
});
