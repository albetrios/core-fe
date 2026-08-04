import { screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { ScheduleCalendar } from './ScheduleCalendar.tsx';

describe('ScheduleCalendar', () => {
  it('renders the calendar and the upcoming events list', async () => {
    renderWithProviders(<ScheduleCalendar />);

    expect(await screen.findByTestId('dashboard-schedule-calendar')).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByText('Plan renewal')).toBeInTheDocument();
    expect(screen.getByText('Invoice due')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<ScheduleCalendar />);
    await screen.findByTestId('dashboard-schedule-calendar');
    expect(await axe(container)).toHaveNoViolations();
  }, 15_000);
});
