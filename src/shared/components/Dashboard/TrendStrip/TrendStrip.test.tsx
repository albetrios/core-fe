import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { TrendStrip } from './TrendStrip.tsx';

describe('TrendStrip', () => {
  it('renders the sample badge and one card per trend with a sparkline', async () => {
    renderWithProviders(<TrendStrip />);

    expect(await screen.findByTestId('dashboard-trend-strip')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-trend-sample')).toBeInTheDocument();
    for (const id of ['sessions', 'apiCalls', 'reviews']) {
      const card = screen.getByTestId(`dashboard-trend-${id}`);
      expect(card).toBeInTheDocument();
      expect(card.querySelector('polyline')).not.toBeNull();
    }
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<TrendStrip />);
    await screen.findByTestId('dashboard-trend-strip');
    expect(await axe(container)).toHaveNoViolations();
  });
});
