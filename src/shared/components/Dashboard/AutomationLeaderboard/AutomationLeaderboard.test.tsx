import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { AutomationLeaderboard } from './AutomationLeaderboard.tsx';

describe('AutomationLeaderboard', () => {
  it('renders its key surfaces', async () => {
    renderWithProviders(<AutomationLeaderboard />);

    expect(await screen.findByTestId('dashboard-leaderboard')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-leaderboard-sample')).toBeInTheDocument();
    expect(
      screen.getByTestId('dashboard-leaderboard-row-welcomeEmail'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-leaderboard-row-backupJob')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<AutomationLeaderboard />);
    await screen.findByTestId('dashboard-leaderboard');
    expect(await axe(container)).toHaveNoViolations();
  });
});
