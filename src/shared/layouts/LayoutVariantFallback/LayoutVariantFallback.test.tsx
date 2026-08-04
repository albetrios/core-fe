import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

import { LayoutVariantFallback } from './LayoutVariantFallback.tsx';

describe('LayoutVariantFallback', () => {
  it('renders a lightweight busy placeholder while a layout variant chunk loads', () => {
    render(<LayoutVariantFallback />);
    expect(screen.getByTestId('layout-variant-fallback')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<LayoutVariantFallback />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
