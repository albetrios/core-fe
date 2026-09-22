import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { reducedMotion } = vi.hoisted(() => ({ reducedMotion: { value: false } }));
vi.mock('@/lib/animations/index.ts', () => ({
  prefersReducedMotion: () => reducedMotion.value,
}));

import { useLoadingMessage } from './useLoadingMessage.ts';

function Probe({ name, active }: { name?: string; active?: boolean }) {
  return <span data-testid="message">{useLoadingMessage(name, active)}</span>;
}

/** Advance past one rotation tick (1.6s) and let React flush. */
function tick(times = 1) {
  act(() => {
    vi.advanceTimersByTime(1_600 * times);
  });
}

describe('useLoadingMessage', () => {
  beforeEach(() => {
    reducedMotion.value = false;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on a line naming what is loading', () => {
    render(<Probe name="Members" />);
    expect(screen.getByTestId('message')).toHaveTextContent(/Members/);
  });

  it('still says something when nothing is named', () => {
    render(<Probe />);
    expect(screen.getByTestId('message').textContent?.trim()).not.toBe('');
  });

  // The point of the rotation: a line that never changes reads as a frozen
  // screen, which is the thing a skeleton exists to rule out.
  it('moves on while the wait continues', () => {
    render(<Probe name="Members" />);
    const first = screen.getByTestId('message').textContent;

    tick();
    const second = screen.getByTestId('message').textContent;
    expect(second).not.toBe(first);

    tick();
    const third = screen.getByTestId('message').textContent;
    expect(third).not.toBe(second);
  });

  // Cycling back to "Loading…" after "Almost there" reads as a stall, and by
  // then the honest signal is that it is simply taking a while.
  it('stops on the last line instead of looping', () => {
    render(<Probe name="Members" />);
    tick(2);
    const last = screen.getByTestId('message').textContent;

    tick(5);
    expect(screen.getByTestId('message')).toHaveTextContent(last ?? '');
  });

  // A fast query never gets past the first line — the later ones exist for the
  // slow case, not as a sequence everyone sits through.
  it('holds the first line for a wait that ends quickly', () => {
    render(<Probe name="Members" />);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId('message')).toHaveTextContent(/Members/);
  });

  it('does not rotate under reduced motion', () => {
    reducedMotion.value = true;
    render(<Probe name="Members" />);
    const first = screen.getByTestId('message').textContent;
    tick(3);
    expect(screen.getByTestId('message')).toHaveTextContent(first ?? '');
  });

  it('freezes when the caller says the wait is over', () => {
    render(<Probe name="Members" active={false} />);
    const first = screen.getByTestId('message').textContent;
    tick(3);
    expect(screen.getByTestId('message')).toHaveTextContent(first ?? '');
  });

  // A different thing is being fetched: start its wait from the top rather than
  // inheriting the previous one's "Almost there".
  it('restarts when what is loading changes', () => {
    const { rerender } = render(<Probe name="Members" />);
    tick(2);
    const late = screen.getByTestId('message').textContent;

    rerender(<Probe name="Billing" />);
    expect(screen.getByTestId('message')).toHaveTextContent(/Billing/);
    expect(screen.getByTestId('message').textContent).not.toBe(late);
  });
});
