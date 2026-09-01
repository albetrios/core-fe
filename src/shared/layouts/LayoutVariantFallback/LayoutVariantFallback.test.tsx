import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

import { LayoutVariantFallback } from './LayoutVariantFallback.tsx';

describe('LayoutVariantFallback', () => {
  it('renders a shell-shaped busy placeholder while a layout variant chunk loads', () => {
    render(<LayoutVariantFallback />);
    const fallback = screen.getByTestId('layout-variant-fallback');
    expect(fallback).toBeInTheDocument();
    // `role="status"` + sr-only text, not `aria-label` on a bare div: a label on an
    // element with no role is an axe `aria-prohibited-attr` violation.
    expect(fallback).toHaveAttribute('role', 'status');
    expect(fallback).toHaveAttribute('aria-busy', 'true');
    // Translated via a11y.loading — asserting the key's English value, not a literal.
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('fills the frame rather than sitting in a strip on a blank page (SHELL-1)', () => {
    render(<LayoutVariantFallback />);
    // `min-h-24` made a shell swap read as a broken page; the placeholder has to
    // hold the shape of the thing it stands in for.
    expect(screen.getByTestId('layout-variant-fallback')).toHaveClass('flex-1');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<LayoutVariantFallback />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
