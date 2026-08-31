import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { GlobalActivityMap } from './GlobalActivityMap.tsx';

describe('GlobalActivityMap', () => {
  it('renders the sample badge, every region row, and every ping', async () => {
    renderWithProviders(<GlobalActivityMap />);

    expect(await screen.findByTestId('dashboard-global-map')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-map-sample')).toBeInTheDocument();
    for (const id of ['americas', 'europe', 'asia', 'oceania']) {
      expect(screen.getByTestId(`dashboard-map-region-${id}`)).toBeInTheDocument();
    }
    for (const id of ['nyc', 'sao', 'lon', 'mum', 'sin', 'syd']) {
      expect(screen.getByTestId(`dashboard-map-marker-${id}`)).toBeInTheDocument();
    }
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<GlobalActivityMap />);
    await screen.findByTestId('dashboard-global-map');
    expect(await axe(container)).toHaveNoViolations();
  });
});
