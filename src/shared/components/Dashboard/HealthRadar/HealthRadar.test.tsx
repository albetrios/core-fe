import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { HealthRadar } from './HealthRadar.tsx';

describe('HealthRadar', () => {
  it('renders its key surfaces', async () => {
    renderWithProviders(<HealthRadar />);

    expect(await screen.findByTestId('dashboard-radar')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-radar-sample')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-radar-axis-security')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-radar-axis-engagement')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<HealthRadar />);
    await screen.findByTestId('dashboard-radar');
    expect(await axe(container)).toHaveNoViolations();
  });
});
