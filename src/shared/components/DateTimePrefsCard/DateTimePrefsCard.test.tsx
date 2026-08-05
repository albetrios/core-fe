import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

import { DateTimePrefsCard } from './DateTimePrefsCard.tsx';

describe('DateTimePrefsCard', () => {
  beforeEach(() => {
    useLocaleStore.setState({
      formatLocale: 'en-US',
      dateFormat: 'auto',
      hourCycle: 'auto',
      timeZone: 'auto',
    });
  });

  it('renders regional locale, timezone, and format controls', () => {
    render(<DateTimePrefsCard />);
    expect(screen.getByTestId('date-time-prefs')).toBeInTheDocument();
    expect(screen.getByTestId('format-locale-select')).toBeInTheDocument();
    expect(screen.getByTestId('time-zone-select')).toBeInTheDocument();
    expect(screen.getByTestId('date-format-auto')).toBeInTheDocument();
    expect(screen.getByTestId('hour-cycle-h12')).toBeInTheDocument();
    expect(screen.getByTestId('locale-preview-timezone')).toBeInTheDocument();
  });

  it('updates date format and hour cycle from the pills', async () => {
    const user = userEvent.setup();
    render(<DateTimePrefsCard />);
    await user.click(screen.getByTestId('date-format-short'));
    expect(useLocaleStore.getState().dateFormat).toBe('short');
    await user.click(screen.getByTestId('hour-cycle-h23'));
    expect(useLocaleStore.getState().hourCycle).toBe('h23');
  });

  it('updates format locale and timezone from the selects', async () => {
    const user = userEvent.setup();
    render(<DateTimePrefsCard />);

    await user.click(screen.getByTestId('format-locale-select'));
    await user.click(await screen.findByTestId('format-locale-ja_JP'));
    expect(useLocaleStore.getState().formatLocale).toBe('ja-JP');

    await user.click(screen.getByTestId('time-zone-select'));
    await user.click(await screen.findByTestId('time-zone-UTC'));
    expect(useLocaleStore.getState().timeZone).toBe('UTC');
  });
});
