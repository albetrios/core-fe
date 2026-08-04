import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the vi.mock factories below can reference them safely.
const h = vi.hoisted(() => ({
  firstDayOfWeek: 'monday' as 'saturday' | 'sunday' | 'monday',
  formatDate: vi.fn<(date: Date, options?: unknown) => string>(() => 'MONTH'),
  calendarProps: vi.fn<(props: Record<string, unknown>) => void>(),
}));

vi.mock('@/shared/hooks/useLocaleFormat/index.ts', () => ({
  useLocaleFormat: () => ({
    formatDate: h.formatDate,
    firstDayOfWeek: h.firstDayOfWeek,
  }),
}));

// Stub the vendored primitive — we assert the wrapper's prop contract, not
// react-day-picker's internals (which would make this test brittle across upgrades).
vi.mock('@/shared/components/ui/calendar.tsx', () => ({
  Calendar: (props: Record<string, unknown>) => {
    h.calendarProps(props);
    return null;
  },
}));

import { LocalizedCalendar } from './LocalizedCalendar.tsx';

function lastCalendarProps(): Record<string, unknown> {
  const call = h.calendarProps.mock.calls.at(-1);
  if (!call) throw new Error('Calendar was never rendered');
  return call[0];
}

describe('LocalizedCalendar', () => {
  afterEach(() => {
    h.firstDayOfWeek = 'monday';
    h.calendarProps.mockClear();
    h.formatDate.mockClear();
  });

  it.each([
    ['sunday', 0],
    ['monday', 1],
    ['saturday', 6],
  ] as const)('maps firstDayOfWeek=%s to weekStartsOn=%i', (day, expected) => {
    h.firstDayOfWeek = day;
    render(<LocalizedCalendar />);
    expect(lastCalendarProps().weekStartsOn).toBe(expected);
  });

  it('lets an explicit weekStartsOn prop override the locale pref', () => {
    h.firstDayOfWeek = 'sunday'; // pref would otherwise derive 0
    render(<LocalizedCalendar weekStartsOn={3} />);
    expect(lastCalendarProps().weekStartsOn).toBe(3);
  });

  it('injects a month-dropdown formatter backed by the locale formatDate', () => {
    render(<LocalizedCalendar />);
    const formatters = lastCalendarProps().formatters as {
      formatMonthDropdown: (date: Date) => string;
    };
    const label = formatters.formatMonthDropdown(new Date('2026-03-15T00:00:00.000Z'));
    expect(h.formatDate).toHaveBeenCalledWith(
      expect.any(Date),
      { month: 'short' },
      { civilDay: true },
    );
    expect(label).toBe('MONTH');
  });

  it('preserves caller-supplied formatters alongside the injected one', () => {
    const formatWeekdayName = vi.fn(() => 'Mo');
    render(<LocalizedCalendar formatters={{ formatWeekdayName }} />);
    const formatters = lastCalendarProps().formatters as Record<string, unknown>;
    expect(formatters.formatWeekdayName).toBe(formatWeekdayName);
    expect(typeof formatters.formatMonthDropdown).toBe('function');
  });
});
