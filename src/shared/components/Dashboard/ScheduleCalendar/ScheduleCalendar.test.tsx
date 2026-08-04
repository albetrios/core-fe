import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { ScheduleCalendar } from './ScheduleCalendar.tsx';

describe('ScheduleCalendar', () => {
  beforeEach(() => {
    useLocaleStore.setState({ formatLocale: 'en-US' });
  });

  it('renders the calendar and the upcoming events list', async () => {
    renderWithProviders(<ScheduleCalendar />);

    expect(await screen.findByTestId('dashboard-schedule-calendar')).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByText('Plan renewal')).toBeInTheDocument();
    expect(screen.getByText('Invoice due')).toBeInTheDocument();
  }, 15_000);

  it('honors Saturday-start regions for the week grid', async () => {
    useLocaleStore.setState({ formatLocale: 'ar-SA' });
    renderWithProviders(<ScheduleCalendar />);
    expect(await screen.findByTestId('dashboard-schedule-calendar')).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
  }, 15_000);

  it('honors Monday-start regions for the week grid', async () => {
    useLocaleStore.setState({ formatLocale: 'de-DE' });
    renderWithProviders(<ScheduleCalendar />);
    expect(await screen.findByTestId('dashboard-schedule-calendar')).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
  }, 15_000);

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<ScheduleCalendar />);
    await screen.findByTestId('dashboard-schedule-calendar');
    expect(await axe(container)).toHaveNoViolations();
  }, 15_000);
});
