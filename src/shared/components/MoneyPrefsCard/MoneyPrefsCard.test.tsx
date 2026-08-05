import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

type MockLocaleState = {
  numberStyle: 'auto';
  currencyDisplay: 'auto';
  currencyCode: 'USD';
  setNumberStyle: (f: string) => void;
  setCurrencyDisplay: (f: string) => void;
  setCurrencyCode: (f: string) => void;
};

const { setNumberStyleMock, setCurrencyDisplayMock } = vi.hoisted(() => ({
  setNumberStyleMock: vi.fn(),
  setCurrencyDisplayMock: vi.fn(),
}));

const noop = () => {};

vi.mock('@/shared/store/useLocaleStore/index.ts', () => ({
  useLocaleStore: (selector: (s: MockLocaleState) => unknown) =>
    selector({
      numberStyle: 'auto',
      currencyDisplay: 'auto',
      currencyCode: 'USD',
      setNumberStyle: setNumberStyleMock,
      setCurrencyDisplay: setCurrencyDisplayMock,
      setCurrencyCode: noop,
    }),
}));

vi.mock('@/shared/hooks/useLocaleFormat/index.ts', () => ({
  useLocaleFormat: () => ({
    formatNumber: () => '1,284.5',
    formatCurrency: () => '$99.00',
    formatRelativeTime: () => '2 hours ago',
    direction: 'ltr',
    firstDayOfWeek: 'sunday',
    measurementSystem: 'imperial',
  }),
}));

import { MoneyPrefsCard } from './MoneyPrefsCard.tsx';

describe('MoneyPrefsCard', () => {
  beforeEach(() => {
    setNumberStyleMock.mockClear();
    setCurrencyDisplayMock.mockClear();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<MoneyPrefsCard />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('updates number style and currency display', async () => {
    const user = userEvent.setup();
    render(<MoneyPrefsCard />);
    expect(screen.getByTestId('money-prefs')).toBeInTheDocument();
    await user.click(screen.getByTestId('number-style-compact'));
    expect(setNumberStyleMock).toHaveBeenCalledWith('compact');
    await user.click(screen.getByTestId('currency-display-code'));
    expect(setCurrencyDisplayMock).toHaveBeenCalledWith('code');
  });

  it('surfaces the derived locale experience (direction, week start, units)', () => {
    render(<MoneyPrefsCard />);
    expect(screen.getByTestId('locale-preview-direction')).toBeInTheDocument();
    expect(screen.getByTestId('locale-preview-first-day')).toBeInTheDocument();
    expect(screen.getByTestId('locale-preview-measurement')).toBeInTheDocument();
  });
});
