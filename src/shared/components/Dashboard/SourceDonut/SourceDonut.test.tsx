import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { SourceDonut } from './SourceDonut.tsx';

describe('SourceDonut', () => {
  it('renders the sample badge, the total, and one legend row per segment', async () => {
    renderWithProviders(<SourceDonut />);

    expect(await screen.findByTestId('dashboard-source-donut')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-donut-sample')).toBeInTheDocument();
    // 612 + 285 + 158 = 1,055 sessions.
    expect(screen.getByTestId('dashboard-donut-total')).toHaveTextContent('1,055');
    for (const id of ['web', 'mobile', 'api']) {
      expect(screen.getByTestId(`dashboard-donut-segment-${id}`)).toBeInTheDocument();
    }
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<SourceDonut />);
    await screen.findByTestId('dashboard-source-donut');
    expect(await axe(container)).toHaveNoViolations();
  });
});
