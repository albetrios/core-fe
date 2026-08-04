import { useCallback, useMemo } from 'react';

import {
  formatCurrencyValue,
  type FormatDateMeta,
  formatDateValue,
  formatNumberValue,
  formatRelativeTimeValue,
  type LocaleFormatInput,
} from '@/lib/i18n/format.ts';
import {
  type FirstDayOfWeek,
  type MeasurementSystem,
  regionLocaleFacts,
  resolvedTextDirection,
} from '@/lib/i18n/intl-config.ts';
import type { TextDirection } from '@/lib/i18n/locales.ts';
import {
  localeFormatPrefs,
  useLocaleStore,
} from '@/shared/store/useLocaleStore/index.ts';

/**
 * Reactive Intl formatters driven by {@link useLocaleStore} preferences, plus the
 * derived locale facts (text direction, first day of week, measurement system) so
 * the whole app can adapt to a region — not just translate copy.
 */
export function useLocaleFormat(): {
  prefs: LocaleFormatInput;
  direction: TextDirection;
  firstDayOfWeek: FirstDayOfWeek;
  measurementSystem: MeasurementSystem;
  formatDate: (
    iso: string | Date,
    options?: Intl.DateTimeFormatOptions,
    meta?: FormatDateMeta,
  ) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (cents: number, currency?: string) => string;
  formatRelativeTime: (iso: string | Date, base?: Date) => string;
} {
  const locale = useLocaleStore((s) => s.locale);
  const formatLocale = useLocaleStore((s) => s.formatLocale);
  const dateFormat = useLocaleStore((s) => s.dateFormat);
  const hourCycle = useLocaleStore((s) => s.hourCycle);
  const timeZone = useLocaleStore((s) => s.timeZone);
  const textDirection = useLocaleStore((s) => s.textDirection);
  const numberStyle = useLocaleStore((s) => s.numberStyle);
  const currencyDisplay = useLocaleStore((s) => s.currencyDisplay);
  const currencyCode = useLocaleStore((s) => s.currencyCode);
  const prefs = useMemo(
    () =>
      localeFormatPrefs({
        locale,
        formatLocale,
        dateFormat,
        hourCycle,
        timeZone,
        numberStyle,
        currencyDisplay,
        currencyCode,
      }),
    [
      locale,
      formatLocale,
      dateFormat,
      hourCycle,
      timeZone,
      numberStyle,
      currencyDisplay,
      currencyCode,
    ],
  );

  const formatDate = useCallback(
    (iso: string | Date, options?: Intl.DateTimeFormatOptions, meta?: FormatDateMeta) =>
      formatDateValue(iso, prefs, options, meta),
    [prefs],
  );
  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumberValue(value, prefs, options),
    [prefs],
  );
  const formatCurrency = useCallback(
    (cents: number, currency?: string) =>
      formatCurrencyValue(cents, currency ?? currencyCode, prefs),
    [prefs, currencyCode],
  );
  const formatRelativeTime = useCallback(
    (iso: string | Date, base?: Date) => formatRelativeTimeValue(iso, prefs, base),
    [prefs],
  );

  const facts = regionLocaleFacts(formatLocale);

  return {
    prefs,
    direction: resolvedTextDirection(textDirection, locale),
    firstDayOfWeek: facts.firstDayOfWeek,
    measurementSystem: facts.measurementSystem,
    formatDate,
    formatNumber,
    formatCurrency,
    formatRelativeTime,
  };
}
