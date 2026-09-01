import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { MiniGantt } from './MiniGantt.tsx';

describe('MiniGantt', () => {
  it('renders its key surfaces', async () => {
    renderWithProviders(<MiniGantt />);

    expect(await screen.findByTestId('dashboard-mini-gantt')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-gantt-sample')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-gantt-bar-evt_1')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-gantt-bar-evt_4')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<MiniGantt />);
    await screen.findByTestId('dashboard-mini-gantt');
    expect(await axe(container)).toHaveNoViolations();
  });
});
