import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { Skeleton, SkeletonShimmer } from './Skeleton.tsx';

describe.each([
  ['Skeleton', Skeleton, 'animate-pulse'],
  ['SkeletonShimmer', SkeletonShimmer, 'animate-shimmer'],
] as const)('%s', (_name, Placeholder, animation) => {
  it('carries the skeleton slot, so the Shape axis reaches it', () => {
    // Regression: only the vendored `ui/skeleton` had the slot. These two are
    // the ones the dashboard, the members table and the shell actually load
    // with — a Sharp app painted round placeholders, then snapped square.
    render(<Placeholder data-testid="placeholder" />);

    expect(screen.getByTestId('placeholder')).toHaveAttribute('data-slot', 'skeleton');
  });

  it('takes its corners from the radius scale, never a fixed value', () => {
    render(<Placeholder data-testid="placeholder" />);

    expect(screen.getByTestId('placeholder')).toHaveClass('rounded-md', animation);
  });

  it('merges caller classes over its own', () => {
    render(<Placeholder data-testid="placeholder" className="h-5 w-16 rounded-full" />);

    const placeholder = screen.getByTestId('placeholder');
    expect(placeholder).toHaveClass('h-5', 'w-16', 'rounded-full');
    // tailwind-merge drops the default the caller overrode.
    expect(placeholder).not.toHaveClass('rounded-md');
  });

  it('announces itself as loading and has no accessibility violations', async () => {
    const { container } = render(<Placeholder />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
