import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { BillingSummary } from './BillingSummary.tsx';

describe('BillingSummary', () => {
  it('renders its key surfaces', async () => {
    renderWithProviders(<BillingSummary />);

    expect(await screen.findByTestId('dashboard-billing-summary')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-billing-sample')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-billing-amount')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<BillingSummary />);
    await screen.findByTestId('dashboard-billing-summary');
    expect(await axe(container)).toHaveNoViolations();
  });
});
