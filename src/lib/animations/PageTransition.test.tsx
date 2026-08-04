import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { PageTransition } from './PageTransition.tsx';

describe('PageTransition', () => {
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
});
