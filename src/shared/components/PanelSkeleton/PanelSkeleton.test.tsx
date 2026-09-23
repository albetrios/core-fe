import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PanelSkeleton } from './PanelSkeleton.tsx';

describe('PanelSkeleton', () => {
  it('draws one skeleton block', () => {
    render(<PanelSkeleton />);
    expect(screen.getByTestId('panel-skeleton')).toBeInTheDocument();
  });

  it('takes a caller test id so an existing assertion keeps working', () => {
    render(<PanelSkeleton testId="sessions-loading" />);
    expect(screen.getByTestId('sessions-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-skeleton')).not.toBeInTheDocument();
  });

  // `Skeleton` is decorative, so the bars announce nothing. Without this region a
  // screen reader was told nothing at all while a surface loaded.
  it('announces the wait once, politely, to screen readers only', () => {
    const { container } = render(<PanelSkeleton />);
    const live = container.querySelector('output[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toHaveClass('sr-only');
  });

  // The whole point of the change: a wait is ONE state, not a sequence. If a
  // later edit reintroduces a rotating line, this pins that it must not be visible.
  it('renders no visible loading text', () => {
    const { container } = render(<PanelSkeleton />);
    // Strip the screen-reader region, then assert nothing readable is left: the
    // wrapper's own textContent includes its sr-only child, so filtering
    // elements is not enough.
    const clone = container.cloneNode(true) as HTMLElement;
    for (const srOnly of clone.querySelectorAll('.sr-only')) srOnly.remove();
    expect(clone.textContent?.trim()).toBe('');
  });
});
