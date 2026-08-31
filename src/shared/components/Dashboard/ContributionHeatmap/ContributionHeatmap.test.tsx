import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { ContributionHeatmap } from './ContributionHeatmap.tsx';

describe('ContributionHeatmap', () => {
  it('renders its key surfaces', async () => {
    renderWithProviders(<ContributionHeatmap />);

    expect(await screen.findByTestId('dashboard-heatmap')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-heatmap-sample')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-heatmap-week-0')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-heatmap-week-11')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<ContributionHeatmap />);
    await screen.findByTestId('dashboard-heatmap');
    expect(await axe(container)).toHaveNoViolations();
  });
});
