import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { PageTransition } from './PageTransition.tsx';

const { locationMock } = vi.hoisted(() => ({ locationMock: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useLocation: () => locationMock() as { pathname: string } };
});

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
});
