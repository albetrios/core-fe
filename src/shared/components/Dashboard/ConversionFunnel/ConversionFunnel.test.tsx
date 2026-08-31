import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { ConversionFunnel } from './ConversionFunnel.tsx';

describe('ConversionFunnel', () => {
  it('renders its key surfaces', async () => {
    renderWithProviders(<ConversionFunnel />);

    expect(await screen.findByTestId('dashboard-funnel')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-funnel-sample')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-funnel-stage-visited')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-funnel-stage-activated')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<ConversionFunnel />);
    await screen.findByTestId('dashboard-funnel');
    expect(await axe(container)).toHaveNoViolations();
  });
});
