import { act, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { PageTransition } from './PageTransition.tsx';

const { locationMock } = vi.hoisted(() => ({ locationMock: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useLocation: () => locationMock() as { pathname: string } };
});

interface CommitFrame {
  /** Classes on the wrapper when the commit ended — what the first frame paints. */
  classes: string[];
  /** `class` writes that landed DURING this commit; 0 = the work happens after paint. */
  classWrites: number;
}

/**
 * Watches the wrapper from a layout effect in the PARENT of `PageTransition`.
 *
 * Layout effects flush child-first within one commit and every one of them runs
 * before the browser can paint, while `useEffect` callbacks run after it. A
 * parent layout effect is therefore the last observation point still inside the
 * commit: what it sees is exactly what the user's first frame shows.
 */
function FirstFrameProbe({
  frames,
  children,
}: {
  frames: CommitFrame[];
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useLayoutEffect(() => {
    const wrapper = hostRef.current?.querySelector('[data-route]');
    if (!wrapper) return;
    frames.push({
      classes: Array.from(wrapper.classList),
      // `takeRecords()` drains synchronously, so it can only report writes made
      // earlier in THIS commit — anything an after-paint effect does is
      // invisible to it, which is precisely the distinction under test.
      classWrites: observerRef.current?.takeRecords().length ?? 0,
    });
    if (!observerRef.current) {
      observerRef.current = new MutationObserver(() => {
        // Records are read synchronously via `takeRecords()`; the callback only
        // exists because the constructor demands one.
      });
      observerRef.current.observe(wrapper, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
  });

  /*
   * Drop whatever landed after paint, so the layout read above can only ever
   * see writes from its own commit. Passive effects flush child-first too, so
   * this runs after `PageTransition`'s — which is exactly the write we want to
   * throw away, because a write that reaches here has already been painted.
   */
  useEffect(() => {
    observerRef.current?.takeRecords();
  });

  useLayoutEffect(() => () => observerRef.current?.disconnect(), []);

  return <div ref={hostRef}>{children}</div>;
}

/** Keeps local state so a remount is observable from the outside. */
function StatefulChild() {
  const [n, setN] = useState(0);
  return (
    <button type="button" data-testid="counter" onClick={() => setN((v) => v + 1)}>
      {n}
    </button>
  );
}

describe('PageTransition', () => {
  beforeEach(() => {
    locationMock.mockReturnValue({ pathname: '/organization/acme/dashboard' });
  });

  it('renders children with readable foreground and route-rise animation class', async () => {
    renderWithProviders(
      <PageTransition>
        <p data-testid="page-copy">Dashboard copy</p>
      </PageTransition>,
    );

    const copy = await screen.findByTestId('page-copy');
    expect(copy).toHaveTextContent('Dashboard copy');
    const wrapper = copy.parentElement;
    expect(wrapper).toHaveClass('text-foreground');
    expect(wrapper).toHaveClass('animate-fade-in-up');
    expect(wrapper).not.toHaveClass('opacity-0');
  });

  describe('SHELL-6 — a route change animates, it does not remount', () => {
    it('keeps the same wrapper element and the child state across a path change', () => {
      locationMock.mockReturnValue({ pathname: '/organization/acme/dashboard' });
      const { rerender } = render(
        <PageTransition>
          <StatefulChild />
        </PageTransition>,
      );

      const counter = screen.getByTestId('counter');
      const wrapperBefore = counter.parentElement;
      act(() => counter.click());
      expect(counter).toHaveTextContent('1');

      // Switch organization — a real path change.
      locationMock.mockReturnValue({ pathname: '/organization/globex/dashboard' });
      rerender(
        <PageTransition>
          <StatefulChild />
        </PageTransition>,
      );

      // `key={pathname}` made both of these fail: a new key throws the element
      // away, so every widget below it remounts and its state is gone.
      expect(screen.getByTestId('counter').parentElement).toBe(wrapperBefore);
      expect(screen.getByTestId('counter')).toHaveTextContent('1');
    });

    it('still re-applies the animation class on a path change', () => {
      locationMock.mockReturnValue({ pathname: '/a' });
      const { rerender } = render(
        <PageTransition>
          <p data-testid="copy">copy</p>
        </PageTransition>,
      );
      const wrapper = screen.getByTestId('copy').parentElement;
      expect(wrapper).toHaveClass('animate-fade-in-up');

      locationMock.mockReturnValue({ pathname: '/b' });
      rerender(
        <PageTransition>
          <p data-testid="copy">copy</p>
        </PageTransition>,
      );

      // Not remounting must not mean not animating.
      expect(wrapper).toHaveClass('animate-fade-in-up');
      expect(wrapper).toHaveAttribute('data-route', '/b');
    });
  });

  describe('the animation starts inside the commit, not one frame after it', () => {
    it('has the animation class on the node the very first frame paints', () => {
      const frames: CommitFrame[] = [];
      render(
        <FirstFrameProbe frames={frames}>
          <PageTransition>
            <p data-testid="copy">copy</p>
          </PageTransition>
        </FirstFrameProbe>,
      );

      expect(frames).toHaveLength(1);
      // From `useEffect` the class only lands after paint, so the first frame
      // shows the page at rest and it then snaps back to keyframe 0 — the
      // flicker. This is the assertion that separates the two timings.
      expect(frames[0]?.classes).toContain('animate-fade-in-up');
    });

    it('replays the animation inside the route-change commit', () => {
      const frames: CommitFrame[] = [];
      locationMock.mockReturnValue({ pathname: '/a' });
      const { rerender } = render(
        <FirstFrameProbe frames={frames}>
          <PageTransition>
            <p data-testid="copy">copy</p>
          </PageTransition>
        </FirstFrameProbe>,
      );

      locationMock.mockReturnValue({ pathname: '/b' });
      rerender(
        <FirstFrameProbe frames={frames}>
          <PageTransition>
            <p data-testid="copy">copy</p>
          </PageTransition>
        </FirstFrameProbe>,
      );

      expect(frames).toHaveLength(2);
      // The class carries over from the previous route, so its presence alone
      // proves nothing here. What matters is that the remove + re-add that
      // RESTARTS the animation happened before this frame was painted.
      expect(frames[1]?.classes).toContain('animate-fade-in-up');
      expect(frames[1]?.classWrites).toBeGreaterThan(0);
    });
  });
});
