import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { UsageBars } from './UsageBars.tsx';

describe('UsageBars', () => {
  it('renders its key surfaces', async () => {
    renderWithProviders(<UsageBars />);

    expect(await screen.findByTestId('dashboard-usage-bars')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-usage-bars-sample')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<UsageBars />);
    await screen.findByTestId('dashboard-usage-bars');
    expect(await axe(container)).toHaveNoViolations();
  });
});
