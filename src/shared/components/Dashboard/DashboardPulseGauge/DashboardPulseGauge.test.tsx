import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { DashboardPulseGauge } from './DashboardPulseGauge.tsx';

describe('DashboardPulseGauge', () => {
  it('renders the score, the sample badge, and every metric row', async () => {
    renderWithProviders(<DashboardPulseGauge />);

    expect(await screen.findByTestId('dashboard-pulse-gauge')).toBeInTheDocument();
    // Placeholder numbers must be marked as sample data on screen.
    expect(screen.getByTestId('dashboard-pulse-sample')).toBeInTheDocument();
    // Fixture completions: 132/180, 46/60, 9/15 → mean 70%. The count-up tween
    // owns the node while running, so wait for it to land on the final value.
    await waitFor(
      () => expect(screen.getByTestId('dashboard-pulse-score')).toHaveTextContent('70%'),
      { timeout: 2000 },
    );
    expect(screen.getByTestId('dashboard-pulse-metric-sessions')).toHaveTextContent(
      '132/180',
    );
    expect(screen.getByTestId('dashboard-pulse-metric-automations')).toHaveTextContent(
      '46/60',
    );
    expect(screen.getByTestId('dashboard-pulse-metric-reviews')).toHaveTextContent(
      '9/15',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<DashboardPulseGauge />);
    await screen.findByTestId('dashboard-pulse-gauge');
    expect(await axe(container)).toHaveNoViolations();
  });
});
