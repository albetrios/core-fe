import type { ComponentProps } from 'react';

import { Calendar } from '@/shared/components/ui/calendar.tsx';
import { useLocaleFormat } from '@/shared/hooks/useLocaleFormat/index.ts';

type CalendarProps = ComponentProps<typeof Calendar>;

function weekStartsOnFromPrefs(
  firstDayOfWeek: 'saturday' | 'sunday' | 'monday',
): 0 | 1 | 6 {
  if (firstDayOfWeek === 'sunday') return 0;
  if (firstDayOfWeek === 'saturday') return 6;
  return 1;
}

/**
 * Locale-aware Calendar — injects `weekStartsOn` + month dropdown formatting from
 * {@link useLocaleFormat}. App code should import this instead of the vendored
 * `ui/calendar` so new date-picker surfaces honour Appearance prefs by default.
 */
export function LocalizedCalendar({ weekStartsOn, formatters, ...props }: CalendarProps) {
  const { formatDate, firstDayOfWeek } = useLocaleFormat();
  return (
    <Calendar
      weekStartsOn={weekStartsOn ?? weekStartsOnFromPrefs(firstDayOfWeek)}
      formatters={{
        // react-day-picker hands us local-midnight Dates: civilDay keeps a
        // display timezone west of the device from labelling March as Feb.
        formatMonthDropdown: (date) =>
          formatDate(date, { month: 'short' }, { civilDay: true }),
        ...formatters,
      }}
      {...props}
    />
  );
}
