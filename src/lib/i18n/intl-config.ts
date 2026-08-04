import { type I18nLocale, localeDirection, type TextDirection } from './locales.ts';

/** BCP 47 tags for UI languages — used as default format locale. */
export const INTL_LOCALE: Record<I18nLocale, string> = {
  en: 'en-US',
  es: 'es-ES',
  zh: 'zh-CN',
  fr: 'fr-FR',
  de: 'de-DE',
  ja: 'ja-JP',
  pt: 'pt-BR',
  ar: 'ar-SA',
  hi: 'hi-IN',
  ko: 'ko-KR',
  it: 'it-IT',
};

/**
 * Regional format locales (BCP 47) — Intl date/number/currency output. Independent
 * of UI translation language; pick any region worldwide.
 */
export const FORMAT_LOCALE_TAGS = [
  { id: 'en-US', label: 'English (United States)' },
  { id: 'en-GB', label: 'English (United Kingdom)' },
  { id: 'en-IN', label: 'English (India)' },
  { id: 'en-AU', label: 'English (Australia)' },
  { id: 'es-ES', label: 'Spanish (Spain)' },
  { id: 'es-MX', label: 'Spanish (Mexico)' },
  { id: 'es-AR', label: 'Spanish (Argentina)' },
  { id: 'fr-FR', label: 'French (France)' },
  { id: 'fr-CA', label: 'French (Canada)' },
  { id: 'de-DE', label: 'German (Germany)' },
  { id: 'de-AT', label: 'German (Austria)' },
  { id: 'it-IT', label: 'Italian (Italy)' },
  { id: 'pt-BR', label: 'Portuguese (Brazil)' },
  { id: 'pt-PT', label: 'Portuguese (Portugal)' },
  { id: 'nl-NL', label: 'Dutch (Netherlands)' },
  { id: 'pl-PL', label: 'Polish (Poland)' },
  { id: 'ru-RU', label: 'Russian (Russia)' },
  { id: 'tr-TR', label: 'Turkish (Turkey)' },
  { id: 'ja-JP', label: 'Japanese (Japan)' },
  { id: 'ko-KR', label: 'Korean (Korea)' },
  { id: 'zh-CN', label: 'Chinese (Simplified)' },
  { id: 'zh-TW', label: 'Chinese (Traditional)' },
  { id: 'zh-HK', label: 'Chinese (Hong Kong)' },
  { id: 'hi-IN', label: 'Hindi (India)' },
  { id: 'bn-IN', label: 'Bengali (India)' },
  { id: 'ta-IN', label: 'Tamil (India)' },
  { id: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
  { id: 'ar-EG', label: 'Arabic (Egypt)' },
  { id: 'he-IL', label: 'Hebrew (Israel)' },
  { id: 'th-TH', label: 'Thai (Thailand)' },
  { id: 'vi-VN', label: 'Vietnamese (Vietnam)' },
  { id: 'id-ID', label: 'Indonesian (Indonesia)' },
  { id: 'ms-MY', label: 'Malay (Malaysia)' },
  { id: 'sv-SE', label: 'Swedish (Sweden)' },
  { id: 'nb-NO', label: 'Norwegian (Norway)' },
  { id: 'da-DK', label: 'Danish (Denmark)' },
  { id: 'fi-FI', label: 'Finnish (Finland)' },
] as const;

export type FormatLocaleTag = (typeof FORMAT_LOCALE_TAGS)[number]['id'];

export const DEFAULT_FORMAT_LOCALE: FormatLocaleTag = 'en-US';

export function isFormatLocaleTag(value: string): value is FormatLocaleTag {
  return FORMAT_LOCALE_TAGS.some((entry) => entry.id === value);
}

export function normalizeFormatLocaleTag(
  value: string | undefined,
  uiLocale?: I18nLocale,
): FormatLocaleTag {
  if (value && isFormatLocaleTag(value)) return value;
  if (uiLocale && INTL_LOCALE[uiLocale]) {
    const mapped = INTL_LOCALE[uiLocale];
    if (isFormatLocaleTag(mapped)) return mapped;
  }
  return DEFAULT_FORMAT_LOCALE;
}

/** Date/time display presets — Intl + explicit part orders. */
export const DATE_FORMAT_PREFERENCES = [
  'auto',
  'short',
  'medium',
  'long',
  'full',
  'iso',
  'date',
  'time',
  'datetime',
] as const;

export type DateFormatPreference = (typeof DATE_FORMAT_PREFERENCES)[number];
export const DEFAULT_DATE_FORMAT: DateFormatPreference = 'auto';

/** Clock display when time is included. */
export const HOUR_CYCLE_PREFERENCES = ['auto', 'h12', 'h23'] as const;
export type HourCyclePreference = (typeof HOUR_CYCLE_PREFERENCES)[number];
export const DEFAULT_HOUR_CYCLE: HourCyclePreference = 'auto';

/** Number grouping / notation. */
export const NUMBER_STYLE_PREFERENCES = [
  'auto',
  'standard',
  'compact',
  'engineering',
  'scientific',
] as const;
export type NumberStylePreference = (typeof NUMBER_STYLE_PREFERENCES)[number];
export const DEFAULT_NUMBER_STYLE: NumberStylePreference = 'auto';

/** Currency symbol presentation. */
export const CURRENCY_DISPLAY_PREFERENCES = [
  'auto',
  'symbol',
  'narrowSymbol',
  'code',
  'name',
] as const;
export type CurrencyDisplayPreference = (typeof CURRENCY_DISPLAY_PREFERENCES)[number];
export const DEFAULT_CURRENCY_DISPLAY: CurrencyDisplayPreference = 'auto';

/** Sample / preview currencies (ISO 4217) — covers every region we offer below. */
export const CURRENCY_CODES = [
  { id: 'USD', label: 'US Dollar (USD)' },
  { id: 'EUR', label: 'Euro (EUR)' },
  { id: 'GBP', label: 'British Pound (GBP)' },
  { id: 'JPY', label: 'Japanese Yen (JPY)' },
  { id: 'CNY', label: 'Chinese Yuan (CNY)' },
  { id: 'INR', label: 'Indian Rupee (INR)' },
  { id: 'AUD', label: 'Australian Dollar (AUD)' },
  { id: 'CAD', label: 'Canadian Dollar (CAD)' },
  { id: 'CHF', label: 'Swiss Franc (CHF)' },
  { id: 'SAR', label: 'Saudi Riyal (SAR)' },
  { id: 'AED', label: 'UAE Dirham (AED)' },
  { id: 'BRL', label: 'Brazilian Real (BRL)' },
  { id: 'MXN', label: 'Mexican Peso (MXN)' },
  { id: 'KRW', label: 'South Korean Won (KRW)' },
  { id: 'SGD', label: 'Singapore Dollar (SGD)' },
  { id: 'ZAR', label: 'South African Rand (ZAR)' },
  { id: 'ARS', label: 'Argentine Peso (ARS)' },
  { id: 'PLN', label: 'Polish Złoty (PLN)' },
  { id: 'RUB', label: 'Russian Ruble (RUB)' },
  { id: 'TRY', label: 'Turkish Lira (TRY)' },
  { id: 'TWD', label: 'New Taiwan Dollar (TWD)' },
  { id: 'HKD', label: 'Hong Kong Dollar (HKD)' },
  { id: 'EGP', label: 'Egyptian Pound (EGP)' },
  { id: 'ILS', label: 'Israeli Shekel (ILS)' },
  { id: 'THB', label: 'Thai Baht (THB)' },
  { id: 'VND', label: 'Vietnamese Đồng (VND)' },
  { id: 'IDR', label: 'Indonesian Rupiah (IDR)' },
  { id: 'MYR', label: 'Malaysian Ringgit (MYR)' },
  { id: 'SEK', label: 'Swedish Krona (SEK)' },
  { id: 'NOK', label: 'Norwegian Krone (NOK)' },
  { id: 'DKK', label: 'Danish Krone (DKK)' },
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number]['id'];
export const DEFAULT_CURRENCY_CODE: CurrencyCode = 'USD';

export function isCurrencyCode(value: string): value is CurrencyCode {
  return CURRENCY_CODES.some((entry) => entry.id === value);
}

export function normalizeCurrencyCode(value: string | undefined): CurrencyCode {
  if (value && isCurrencyCode(value)) return value;
  return DEFAULT_CURRENCY_CODE;
}

/** Country subtag (uppercase) of a BCP 47 format locale, e.g. `en-IN` → `IN`. */
export function regionOf(formatLocale: string): string {
  return formatLocale.split('-')[1]?.toUpperCase() ?? '';
}

/**
 * Currency people actually transact in, per region. Picking a region (or a
 * language that maps to one) snaps the preview/default currency to this — money
 * is part of the locale experience, not just date and number shapes.
 */
const REGION_CURRENCY = new Map<string, CurrencyCode>([
  ['US', 'USD'],
  ['GB', 'GBP'],
  ['IN', 'INR'],
  ['AU', 'AUD'],
  ['CA', 'CAD'],
  ['ES', 'EUR'],
  ['MX', 'MXN'],
  ['AR', 'ARS'],
  ['FR', 'EUR'],
  ['DE', 'EUR'],
  ['AT', 'EUR'],
  ['IT', 'EUR'],
  ['BR', 'BRL'],
  ['PT', 'EUR'],
  ['NL', 'EUR'],
  ['PL', 'PLN'],
  ['RU', 'RUB'],
  ['TR', 'TRY'],
  ['JP', 'JPY'],
  ['KR', 'KRW'],
  ['CN', 'CNY'],
  ['TW', 'TWD'],
  ['HK', 'HKD'],
  ['SA', 'SAR'],
  ['EG', 'EGP'],
  ['IL', 'ILS'],
  ['TH', 'THB'],
  ['VN', 'VND'],
  ['ID', 'IDR'],
  ['MY', 'MYR'],
  ['SE', 'SEK'],
  ['NO', 'NOK'],
  ['DK', 'DKK'],
  ['FI', 'EUR'],
]);

/** The currency a region transacts in (falls back to USD for unknown regions). */
export function defaultCurrencyForFormatLocale(formatLocale: string): CurrencyCode {
  return REGION_CURRENCY.get(regionOf(formatLocale)) ?? DEFAULT_CURRENCY_CODE;
}

export type FirstDayOfWeek = 'saturday' | 'sunday' | 'monday';
export type MeasurementSystem = 'metric' | 'imperial';

/** Regions whose week starts on Sunday (calendars, "this week" ranges). */
const SUNDAY_FIRST = new Set([
  'US',
  'CA',
  'JP',
  'IN',
  'BR',
  'ZA',
  'IL',
  'HK',
  'TW',
  'KR',
  'MX',
  'AR',
]);
/** Regions whose week starts on Saturday. */
const SATURDAY_FIRST = new Set(['SA', 'EG']);
/** Regions that use imperial units. */
const IMPERIAL = new Set(['US']);

/**
 * Locale facts that shape the experience beyond text: which day the week starts
 * on, the measurement system, and reading direction. Derived from the region so
 * the app can feel native (e.g. calendars, unit labels) — not just translated.
 */
export function regionLocaleFacts(formatLocale: string): {
  firstDayOfWeek: FirstDayOfWeek;
  measurementSystem: MeasurementSystem;
} {
  const region = regionOf(formatLocale);
  let firstDayOfWeek: FirstDayOfWeek = 'monday';
  if (SATURDAY_FIRST.has(region)) firstDayOfWeek = 'saturday';
  else if (SUNDAY_FIRST.has(region)) firstDayOfWeek = 'sunday';
  return {
    firstDayOfWeek,
    measurementSystem: IMPERIAL.has(region) ? 'imperial' : 'metric',
  };
}

export function isDateFormatPreference(value: string): value is DateFormatPreference {
  return (DATE_FORMAT_PREFERENCES as readonly string[]).includes(value);
}

export function normalizeDateFormatPreference(
  value: string | undefined,
): DateFormatPreference {
  if (value && (DATE_FORMAT_PREFERENCES as readonly string[]).includes(value)) {
    return value as DateFormatPreference;
  }
  return DEFAULT_DATE_FORMAT;
}

export function isHourCyclePreference(value: string): value is HourCyclePreference {
  return (HOUR_CYCLE_PREFERENCES as readonly string[]).includes(value);
}

export function normalizeHourCyclePreference(
  value: string | undefined,
): HourCyclePreference {
  if (value && isHourCyclePreference(value)) return value;
  return DEFAULT_HOUR_CYCLE;
}

export function isNumberStylePreference(value: string): value is NumberStylePreference {
  return (NUMBER_STYLE_PREFERENCES as readonly string[]).includes(value);
}

export function normalizeNumberStylePreference(
  value: string | undefined,
): NumberStylePreference {
  if (value && isNumberStylePreference(value)) return value;
  return DEFAULT_NUMBER_STYLE;
}

export function isCurrencyDisplayPreference(
  value: string,
): value is CurrencyDisplayPreference {
  return (CURRENCY_DISPLAY_PREFERENCES as readonly string[]).includes(value);
}

export function normalizeCurrencyDisplayPreference(
  value: string | undefined,
): CurrencyDisplayPreference {
  if (value && isCurrencyDisplayPreference(value)) return value;
  return DEFAULT_CURRENCY_DISPLAY;
}

/**
 * Layout/text direction override. `auto` follows the UI language
 * ({@link localeDirection}); `ltr` / `rtl` force `<html dir>` regardless.
 */
export const TEXT_DIRECTION_PREFERENCES = ['auto', 'ltr', 'rtl'] as const;
/** Preference for forcing or following the UI language direction. */
export type TextDirectionPreference = (typeof TEXT_DIRECTION_PREFERENCES)[number];
/** Default text-direction preference (`auto`). */
export const DEFAULT_TEXT_DIRECTION: TextDirectionPreference = 'auto';

/** Type guard for {@link TextDirectionPreference}. */
export function isTextDirectionPreference(
  value: string,
): value is TextDirectionPreference {
  return (TEXT_DIRECTION_PREFERENCES as readonly string[]).includes(value);
}

/** Coerce unknown input to a valid text-direction preference. */
export function normalizeTextDirectionPreference(
  value: string | undefined,
): TextDirectionPreference {
  if (value && isTextDirectionPreference(value)) return value;
  return DEFAULT_TEXT_DIRECTION;
}

/** Resolve a direction preference to the concrete `ltr` / `rtl` for `<html dir>`. */
export function resolvedTextDirection(
  preference: TextDirectionPreference,
  uiLocale: I18nLocale,
): TextDirection {
  if (preference === 'auto') return localeDirection(uiLocale);
  return preference;
}

/**
 * IANA time zones for display override. `auto` follows the device clock;
 * everything else is passed to `Intl.DateTimeFormat` as `timeZone`.
 */
export const TIME_ZONE_TAGS = [
  { id: 'auto', label: 'Device timezone' },
  { id: 'UTC', label: 'UTC' },
  { id: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { id: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { id: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { id: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { id: 'America/Anchorage', label: 'Alaska' },
  { id: 'Pacific/Honolulu', label: 'Hawaii' },
  { id: 'America/Toronto', label: 'Toronto' },
  { id: 'America/Vancouver', label: 'Vancouver' },
  { id: 'America/Mexico_City', label: 'Mexico City' },
  { id: 'America/Sao_Paulo', label: 'São Paulo' },
  { id: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { id: 'Europe/London', label: 'London' },
  { id: 'Europe/Dublin', label: 'Dublin' },
  { id: 'Europe/Paris', label: 'Paris / Central Europe' },
  { id: 'Europe/Berlin', label: 'Berlin' },
  { id: 'Europe/Amsterdam', label: 'Amsterdam' },
  { id: 'Europe/Rome', label: 'Rome' },
  { id: 'Europe/Madrid', label: 'Madrid' },
  { id: 'Europe/Stockholm', label: 'Stockholm' },
  { id: 'Europe/Oslo', label: 'Oslo' },
  { id: 'Europe/Copenhagen', label: 'Copenhagen' },
  { id: 'Europe/Helsinki', label: 'Helsinki' },
  { id: 'Europe/Warsaw', label: 'Warsaw' },
  { id: 'Europe/Moscow', label: 'Moscow' },
  { id: 'Europe/Istanbul', label: 'Istanbul' },
  { id: 'Africa/Cairo', label: 'Cairo' },
  { id: 'Africa/Johannesburg', label: 'Johannesburg' },
  { id: 'Asia/Dubai', label: 'Dubai' },
  { id: 'Asia/Riyadh', label: 'Riyadh' },
  { id: 'Asia/Jerusalem', label: 'Jerusalem' },
  { id: 'Asia/Kolkata', label: 'India (Kolkata)' },
  { id: 'Asia/Bangkok', label: 'Bangkok' },
  { id: 'Asia/Singapore', label: 'Singapore' },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { id: 'Asia/Shanghai', label: 'China (Shanghai)' },
  { id: 'Asia/Taipei', label: 'Taipei' },
  { id: 'Asia/Tokyo', label: 'Tokyo' },
  { id: 'Asia/Seoul', label: 'Seoul' },
  { id: 'Asia/Jakarta', label: 'Jakarta' },
  { id: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur' },
  { id: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh City' },
  { id: 'Australia/Sydney', label: 'Sydney' },
  { id: 'Australia/Melbourne', label: 'Melbourne' },
  { id: 'Australia/Perth', label: 'Perth' },
  { id: 'Pacific/Auckland', label: 'Auckland' },
] as const;

/** Preference id for display timezone override (`auto` or an IANA zone). */
export type TimeZonePreference = (typeof TIME_ZONE_TAGS)[number]['id'];
/** Default timezone preference (`auto` = device clock). */
export const DEFAULT_TIME_ZONE: TimeZonePreference = 'auto';

/** Type guard for {@link TimeZonePreference}. */
export function isTimeZonePreference(value: string): value is TimeZonePreference {
  return TIME_ZONE_TAGS.some((entry) => entry.id === value);
}

/** Coerce unknown input to a valid timezone preference. */
export function normalizeTimeZonePreference(
  value: string | undefined,
): TimeZonePreference {
  if (value && isTimeZonePreference(value)) return value;
  return DEFAULT_TIME_ZONE;
}

/** Resolve a preference to an IANA zone for Intl (`undefined` = device local). */
export function resolvedTimeZone(preference: TimeZonePreference): string | undefined {
  return preference === 'auto' ? undefined : preference;
}

/**
 * Representative IANA zone per country subtag — picking a region snaps the
 * display timezone the same way it snaps currency.
 */
const REGION_TIME_ZONE = new Map<string, TimeZonePreference>([
  ['US', 'America/New_York'],
  ['CA', 'America/Toronto'],
  ['MX', 'America/Mexico_City'],
  ['BR', 'America/Sao_Paulo'],
  ['AR', 'America/Argentina/Buenos_Aires'],
  ['GB', 'Europe/London'],
  ['IE', 'Europe/Dublin'],
  ['FR', 'Europe/Paris'],
  ['DE', 'Europe/Berlin'],
  ['AT', 'Europe/Berlin'],
  ['NL', 'Europe/Amsterdam'],
  ['IT', 'Europe/Rome'],
  ['ES', 'Europe/Madrid'],
  ['SE', 'Europe/Stockholm'],
  ['NO', 'Europe/Oslo'],
  ['DK', 'Europe/Copenhagen'],
  ['FI', 'Europe/Helsinki'],
  ['PL', 'Europe/Warsaw'],
  ['RU', 'Europe/Moscow'],
  ['TR', 'Europe/Istanbul'],
  ['EG', 'Africa/Cairo'],
  ['ZA', 'Africa/Johannesburg'],
  ['AE', 'Asia/Dubai'],
  ['SA', 'Asia/Riyadh'],
  ['IL', 'Asia/Jerusalem'],
  ['IN', 'Asia/Kolkata'],
  ['TH', 'Asia/Bangkok'],
  ['SG', 'Asia/Singapore'],
  ['HK', 'Asia/Hong_Kong'],
  ['CN', 'Asia/Shanghai'],
  ['TW', 'Asia/Taipei'],
  ['JP', 'Asia/Tokyo'],
  ['KR', 'Asia/Seoul'],
  ['ID', 'Asia/Jakarta'],
  ['MY', 'Asia/Kuala_Lumpur'],
  ['VN', 'Asia/Ho_Chi_Minh'],
  ['AU', 'Australia/Sydney'],
  ['NZ', 'Pacific/Auckland'],
]);

/** Default display timezone for a regional format locale. */
export function defaultTimeZoneForFormatLocale(formatLocale: string): TimeZonePreference {
  return REGION_TIME_ZONE.get(regionOf(formatLocale)) ?? DEFAULT_TIME_ZONE;
}

export function intlLocaleFor(formatLocale: string): string {
  return formatLocale;
}

export function defaultFormatLocaleForUi(uiLocale: I18nLocale): FormatLocaleTag {
  return normalizeFormatLocaleTag(INTL_LOCALE[uiLocale], uiLocale);
}

function hourCycleOptions(
  hourCycle: HourCyclePreference,
): Pick<Intl.DateTimeFormatOptions, 'hour12'> | Record<string, never> {
  if (hourCycle === 'h12') return { hour12: true };
  if (hourCycle === 'h23') return { hour12: false };
  return {};
}

const NUMERIC_DATE: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

const NUMERIC_TIME: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

/** Resolve Intl.DateTimeFormat options for the active regional prefs. */
export function dateFormatOptions(
  preference: DateFormatPreference,
  hourCycle: HourCyclePreference = DEFAULT_HOUR_CYCLE,
): Intl.DateTimeFormatOptions {
  const hour = hourCycleOptions(hourCycle);

  switch (preference) {
    case 'short':
      return { dateStyle: 'short', timeStyle: 'short', ...hour };
    case 'medium':
      return { dateStyle: 'medium', timeStyle: 'medium', ...hour };
    case 'long':
      return { dateStyle: 'long', timeStyle: 'medium', ...hour };
    case 'full':
      return { dateStyle: 'full', timeStyle: 'medium', ...hour };
    case 'iso':
      return { year: 'numeric', month: '2-digit', day: '2-digit', ...hour };
    case 'date':
      return { ...NUMERIC_DATE };
    case 'time':
      return { ...NUMERIC_TIME, ...hour };
    case 'datetime':
      return { ...NUMERIC_DATE, ...NUMERIC_TIME, ...hour };
    default:
      return { ...NUMERIC_DATE, ...NUMERIC_TIME, ...hour };
  }
}

export function numberFormatOptions(
  style: NumberStylePreference,
): Intl.NumberFormatOptions {
  switch (style) {
    case 'compact':
      return { notation: 'compact', maximumFractionDigits: 1 };
    case 'engineering':
      return { notation: 'engineering', maximumFractionDigits: 2 };
    case 'scientific':
      return { notation: 'scientific', maximumFractionDigits: 2 };
    case 'standard':
      return { useGrouping: true };
    default:
      return {};
  }
}

export function currencyFormatOptions(
  display: CurrencyDisplayPreference,
): Intl.NumberFormatOptions {
  if (display === 'auto') return {};
  return { currencyDisplay: display };
}

/** Preview / sample values shown in the locale picker. */
export const LOCALE_FORMAT_SAMPLES = {
  dateIso: '2026-06-25T14:30:45.000Z',
  relativeIso: '2026-06-25T12:30:45.000Z',
  number: 1284750.5,
  currencyCents: 9900,
} as const;
