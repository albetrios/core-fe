import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { DashboardActivityFeed } from './DashboardActivityFeed.tsx';

describe('DashboardActivityFeed', () => {
  it('renders the sample badge and every seeded event with a timestamp', async () => {
    renderWithProviders(<DashboardActivityFeed />);

    expect(await screen.findByTestId('dashboard-activity-feed')).toBeInTheDocument();
    // Placeholder events must be marked as sample data on screen.
    expect(screen.getByTestId('dashboard-activity-sample')).toBeInTheDocument();
    for (const id of ['act_1', 'act_2', 'act_3', 'act_4']) {
      const row = screen.getByTestId(`dashboard-activity-item-${id}`);
      expect(row).toBeInTheDocument();
      expect(row.querySelector('time')).toHaveAttribute('datetime');
    }
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<DashboardActivityFeed />);
    await screen.findByTestId('dashboard-activity-feed');
    expect(await axe(container)).toHaveNoViolations();
  });
});
