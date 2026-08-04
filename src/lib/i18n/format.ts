import {
  type CurrencyCode,
  type CurrencyDisplayPreference,
  currencyFormatOptions,
  dateFormatOptions,
  type DateFormatPreference,
  type FormatLocaleTag,
  type HourCyclePreference,
  intlLocaleFor,
  numberFormatOptions,
  type NumberStylePreference,
  resolvedTimeZone,
  type TimeZonePreference,
} from '@/lib/i18n/intl-config.ts';
import type { I18nLocale } from '@/lib/i18n/locales.ts';

export type LocaleFormatInput = {
  locale: I18nLocale;
  formatLocale: FormatLocaleTag;
  dateFormat: DateFormatPreference;
  hourCycle: HourCyclePreference;
  timeZone: TimeZonePreference;
  numberStyle: NumberStylePreference;
  currencyDisplay: CurrencyDisplayPreference;
  currencyCode: CurrencyCode;
};

/**
 * `Date` values from calendars/placeholders are civil days (local Y-M-D), not
 * absolute instants. When an explicit display TZ is set, format noon-UTC on
 * that civil day so the day number cannot shift across zones. ISO strings stay
 * absolute instants and honour `timeZone` as usual.
 */
function resolveFormatInstant(iso: string | Date, timeZone: string | undefined): Date {
  if (typeof iso === 'string') {
    return new Date(iso);
  }
  if (!timeZone) {
    return iso;
  }
  return new Date(Date.UTC(iso.getFullYear(), iso.getMonth(), iso.getDate(), 12, 0, 0));
}

/**
 * Format a date with the user's regional locale + timezone. Optional `options`
 * replace the stored date-format style (still always honour formatLocale /
 * timeZone) — use for one-off shapes like "weekday long" hero labels.
 */
export function formatDateValue(
  iso: string | Date,
  prefs: LocaleFormatInput,
  options?: Intl.DateTimeFormatOptions,
): string {
  const timeZone = resolvedTimeZone(prefs.timeZone);
  const date = resolveFormatInstant(iso, timeZone);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = intlLocaleFor(prefs.formatLocale);
  const baseOptions = options ?? dateFormatOptions(prefs.dateFormat, prefs.hourCycle);
  try {
    return new Intl.DateTimeFormat(locale, {
      ...baseOptions,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    // Same posture as formatCurrencyValue: never let a bad locale/TZ crash UI.
    // Retry without timeZone (covers migrated-away IANA ids still in storage).
    try {
      return new Intl.DateTimeFormat(locale, baseOptions).format(date);
    } catch {
      return '—';
    }
  }
}

export function formatNumberValue(
  value: number,
  prefs: LocaleFormatInput,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlLocaleFor(prefs.formatLocale), {
    ...numberFormatOptions(prefs.numberStyle),
    ...options,
  }).format(value);
}

export function formatCurrencyValue(
  cents: number,
  currency: string,
  prefs: LocaleFormatInput,
): string {
  const code = (currency || prefs.currencyCode || 'USD').toUpperCase();
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(intlLocaleFor(prefs.formatLocale), {
      style: 'currency',
      currency: code,
      ...currencyFormatOptions(prefs.currencyDisplay),
    }).format(amount);
  } catch {
    // `Intl` throws `RangeError` on a malformed currency code (it validates the
    // alpha-3 ISO 4217 *shape*, not membership) — and `currency` comes straight
    // from the server. Never let one bad value crash the billing UI; fall back
    // to a plain number plus the raw code.
    return `${amount.toFixed(2)} ${code}`;
  }
}

export function formatRelativeTimeValue(
  iso: string | Date,
  prefs: LocaleFormatInput,
  base: Date = new Date(),
): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';

  const diffSeconds = Math.round((date.getTime() - base.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  const intl = intlLocaleFor(prefs.formatLocale);
  const rtf = new Intl.RelativeTimeFormat(intl, { numeric: 'auto' });

  if (abs < 60) return rtf.format(diffSeconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  return formatDateValue(date, prefs);
}
