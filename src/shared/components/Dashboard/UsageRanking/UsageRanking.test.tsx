import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { UsageRanking } from './UsageRanking.tsx';

describe('UsageRanking', () => {
  it('renders the sample badge and metrics ranked by completion', async () => {
    renderWithProviders(<UsageRanking />);

    expect(await screen.findByTestId('dashboard-usage-ranking')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-ranking-sample')).toBeInTheDocument();
    // Ratios: automations 46/60 ≈ .77 > sessions 132/180 ≈ .73 > reviews 9/15 = .6
    const rows = screen.getAllByTestId(/dashboard-ranking-row-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'dashboard-ranking-row-automations',
      'dashboard-ranking-row-sessions',
      'dashboard-ranking-row-reviews',
    ]);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<UsageRanking />);
    await screen.findByTestId('dashboard-usage-ranking');
    expect(await axe(container)).toHaveNoViolations();
  });
});
