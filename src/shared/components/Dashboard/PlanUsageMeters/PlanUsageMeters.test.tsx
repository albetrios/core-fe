import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { PlanUsageMeters } from './PlanUsageMeters.tsx';

describe('PlanUsageMeters', () => {
  it('renders its key surfaces', async () => {
    renderWithProviders(<PlanUsageMeters />);

    expect(await screen.findByTestId('dashboard-plan-meters')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-meters-sample')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-meter-workspaces')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-meter-automations')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<PlanUsageMeters />);
    await screen.findByTestId('dashboard-plan-meters');
    expect(await axe(container)).toHaveNoViolations();
  });
});
