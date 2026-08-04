import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

type MockLocaleState = {
  locale: 'en' | 'es' | 'zh';
  formatLocale: 'en-US';
  dateFormat: 'auto';
  hourCycle: 'auto';
  timeZone: 'auto';
  textDirection: 'auto';
  numberStyle: 'auto';
  currencyDisplay: 'auto';
  currencyCode: 'USD';
  setLocale: (l: 'en' | 'es' | 'zh') => Promise<void>;
  setFormatLocale: (f: string) => void;
  setDateFormat: (f: string) => void;
  setHourCycle: (f: string) => void;
  setTimeZone: (f: string) => void;
  setTextDirection: (f: string) => void;
  setNumberStyle: (f: string) => void;
  setCurrencyDisplay: (f: string) => void;
  setCurrencyCode: (f: string) => void;
};

const {
  setLocaleMock,
  setDateFormatMock,
  setNumberStyleMock,
  setCurrencyDisplayMock,
  localeState,
} = vi.hoisted(() => ({
  setLocaleMock: vi.fn(),
  setDateFormatMock: vi.fn(),
  setNumberStyleMock: vi.fn(),
  setCurrencyDisplayMock: vi.fn(),
  localeState: { locale: 'en' as 'en' | 'es' | 'zh', dateFormat: 'auto' as const },
}));

const noop = () => {};

vi.mock('@/shared/store/useLocaleStore/index.ts', () => ({
  useLocaleStore: (selector: (s: MockLocaleState) => unknown) =>
    selector({
      locale: localeState.locale,
      formatLocale: 'en-US',
      dateFormat: localeState.dateFormat,
      hourCycle: 'auto',
      timeZone: 'auto',
      textDirection: 'auto',
      numberStyle: 'auto',
      currencyDisplay: 'auto',
      currencyCode: 'USD',
      setLocale: setLocaleMock,
      setFormatLocale: noop,
      setDateFormat: setDateFormatMock,
      setHourCycle: noop,
      setTimeZone: noop,
      setTextDirection: noop,
      setNumberStyle: setNumberStyleMock,
      setCurrencyDisplay: setCurrencyDisplayMock,
      setCurrencyCode: noop,
    }),
  localeFormatPrefs: (s: MockLocaleState) => s,
}));

vi.mock('@/shared/hooks/useLocaleFormat/index.ts', () => ({
  useLocaleFormat: () => ({
    formatDate: () => 'Jun 25, 2026',
    formatNumber: () => '1,284.5',
    formatCurrency: () => '$99.00',
    formatRelativeTime: () => '2 hours ago',
    direction: 'ltr',
    firstDayOfWeek: 'sunday',
    measurementSystem: 'imperial',
  }),
}));

import { LanguagePanel } from './LanguagePanel.tsx';

describe('LanguagePanel', () => {
  beforeEach(() => {
    setLocaleMock.mockClear();
    setDateFormatMock.mockClear();
    setNumberStyleMock.mockClear();
    setCurrencyDisplayMock.mockClear();
    localeState.locale = 'en';
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<LanguagePanel />);
    expect(await axe(container)).toHaveNoViolations();
  }, 20_000);

  it('renders the language and regional format controls', () => {
    render(<LanguagePanel />);
    expect(screen.getByTestId('language-panel')).toBeInTheDocument();
    expect(screen.getByTestId('date-time-prefs')).toBeInTheDocument();
    expect(screen.getByTestId('format-locale-select')).toBeInTheDocument();
    expect(screen.getByTestId('time-zone-select')).toBeInTheDocument();
    expect(screen.getByTestId('hour-cycle-h23')).toBeInTheDocument();
  });

  it('switches the UI language', async () => {
    const user = userEvent.setup();
    render(<LanguagePanel />);
    await user.click(screen.getByTestId('language-zh'));
    expect(setLocaleMock).toHaveBeenCalledWith('zh');
  });

  it('updates the date format preference', async () => {
    const user = userEvent.setup();
    render(<LanguagePanel />);
    await user.click(screen.getByTestId('date-format-date'));
    expect(setDateFormatMock).toHaveBeenCalledWith('date');
  });

  it('updates number style and currency display', async () => {
    const user = userEvent.setup();
    render(<LanguagePanel />);
    await user.click(screen.getByTestId('number-style-compact'));
    expect(setNumberStyleMock).toHaveBeenCalledWith('compact');
    await user.click(screen.getByTestId('currency-display-code'));
    expect(setCurrencyDisplayMock).toHaveBeenCalledWith('code');
  });

  it('surfaces the derived locale experience (direction, week start, units)', () => {
    render(<LanguagePanel />);
    expect(screen.getByTestId('locale-preview-direction')).toBeInTheDocument();
    expect(screen.getByTestId('locale-preview-first-day')).toBeInTheDocument();
    expect(screen.getByTestId('locale-preview-measurement')).toBeInTheDocument();
  });
});
