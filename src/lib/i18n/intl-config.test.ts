import { describe, expect, it } from 'vitest';

import {
  currencyFormatOptions,
  dateFormatOptions,
  defaultCurrencyForFormatLocale,
  defaultFormatLocaleForUi,
  intlLocaleFor,
  normalizeCurrencyCode,
  normalizeCurrencyDisplayPreference,
  normalizeDateFormatPreference,
  normalizeFormatLocaleTag,
  normalizeHourCyclePreference,
  normalizeNumberStylePreference,
  normalizeTimeZonePreference,
  numberFormatOptions,
  regionLocaleFacts,
  regionOf,
  resolvedTextDirection,
  resolvedTimeZone,
} from './intl-config.ts';
import { formatLocaleTestId, timeZoneTestId } from './locale.constants.ts';

describe('normalizeFormatLocaleTag', () => {
  it('keeps a valid tag, maps a UI locale, then falls back to en-US', () => {
    expect(normalizeFormatLocaleTag('ja-JP')).toBe('ja-JP');
    expect(normalizeFormatLocaleTag('xx-YY', 'hi')).toBe('hi-IN');
    expect(normalizeFormatLocaleTag(undefined, 'de')).toBe('de-DE');
    expect(normalizeFormatLocaleTag('nope', undefined)).toBe('en-US');
    expect(normalizeFormatLocaleTag(undefined, undefined)).toBe('en-US');
  });
});

describe('regionOf / defaultCurrencyForFormatLocale', () => {
  it('extracts the uppercase region subtag (empty when absent)', () => {
    expect(regionOf('en-IN')).toBe('IN');
    expect(regionOf('pt-br')).toBe('BR');
    expect(regionOf('en')).toBe('');
  });

  it('maps regions to their transaction currency with a USD fallback', () => {
    expect(defaultCurrencyForFormatLocale('en-GB')).toBe('GBP');
    expect(defaultCurrencyForFormatLocale('hi-IN')).toBe('INR');
    expect(defaultCurrencyForFormatLocale('de-DE')).toBe('EUR');
    expect(defaultCurrencyForFormatLocale('ja-JP')).toBe('JPY');
    expect(defaultCurrencyForFormatLocale('xx-ZZ')).toBe('USD');
    expect(defaultCurrencyForFormatLocale('en')).toBe('USD');
  });
});

describe('regionLocaleFacts', () => {
  it('derives first day of week and measurement system per region', () => {
    expect(regionLocaleFacts('en-US')).toEqual({
      firstDayOfWeek: 'sunday',
      measurementSystem: 'imperial',
    });
    expect(regionLocaleFacts('ar-SA').firstDayOfWeek).toBe('saturday');
    expect(regionLocaleFacts('de-DE')).toEqual({
      firstDayOfWeek: 'monday',
      measurementSystem: 'metric',
    });
  });
});

describe('text direction', () => {
  it('auto follows the UI language; explicit prefs force the direction', () => {
    expect(resolvedTextDirection('auto', 'en')).toBe('ltr');
    expect(resolvedTextDirection('auto', 'ar')).toBe('rtl');
    expect(resolvedTextDirection('rtl', 'en')).toBe('rtl');
    expect(resolvedTextDirection('ltr', 'ar')).toBe('ltr');
  });
});

describe('timezone preference', () => {
  it('normalizes unknown zones to auto and resolves auto to device-local', () => {
    expect(normalizeTimeZonePreference('Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(normalizeTimeZonePreference('Mars/Olympus_Mons')).toBe('auto');
    expect(normalizeTimeZonePreference(undefined)).toBe('auto');
    expect(resolvedTimeZone('auto')).toBeUndefined();
    expect(resolvedTimeZone('UTC')).toBe('UTC');
  });
});

describe('preference normalizers', () => {
  it('accept catalog values and coerce garbage to auto/defaults', () => {
    expect(normalizeDateFormatPreference('iso')).toBe('iso');
    expect(normalizeDateFormatPreference('bogus')).toBe('auto');
    expect(normalizeHourCyclePreference('h23')).toBe('h23');
    expect(normalizeHourCyclePreference('25h')).toBe('auto');
    expect(normalizeNumberStylePreference('compact')).toBe('compact');
    expect(normalizeNumberStylePreference('roman')).toBe('auto');
    expect(normalizeCurrencyDisplayPreference('code')).toBe('code');
    expect(normalizeCurrencyDisplayPreference('seashells')).toBe('auto');
    expect(normalizeCurrencyCode('EUR')).toBe('EUR');
    expect(normalizeCurrencyCode('DOGE')).toBe('USD');
    expect(normalizeCurrencyCode(undefined)).toBe('USD');
  });
});

describe('defaultFormatLocaleForUi / intlLocaleFor', () => {
  it('maps every UI language to its regional format locale', () => {
    expect(defaultFormatLocaleForUi('en')).toBe('en-US');
    expect(defaultFormatLocaleForUi('hi')).toBe('hi-IN');
    expect(defaultFormatLocaleForUi('ja')).toBe('ja-JP');
    expect(intlLocaleFor('en-GB')).toBe('en-GB');
  });
});

describe('dateFormatOptions', () => {
  it('maps each preset to its Intl options', () => {
    expect(dateFormatOptions('short')).toEqual({
      dateStyle: 'short',
      timeStyle: 'short',
    });
    expect(dateFormatOptions('medium').dateStyle).toBe('medium');
    expect(dateFormatOptions('long')).toEqual({
      dateStyle: 'long',
      timeStyle: 'medium',
    });
    expect(dateFormatOptions('full').dateStyle).toBe('full');
    expect(dateFormatOptions('iso')).toEqual({
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    expect(dateFormatOptions('date')).toEqual({
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    expect(dateFormatOptions('time')).toEqual({
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    expect(dateFormatOptions('datetime').year).toBe('numeric');
    // auto/unknown falls through to the numeric date+time default.
    expect(dateFormatOptions('auto').hour).toBe('2-digit');
  });

  it('threads the hour-cycle preference through as hour12', () => {
    expect(dateFormatOptions('short', 'h12').hour12).toBe(true);
    expect(dateFormatOptions('short', 'h23').hour12).toBe(false);
    expect(dateFormatOptions('short', 'auto').hour12).toBeUndefined();
    // Pure-date presets never carry an hour cycle.
    expect(dateFormatOptions('date', 'h12').hour12).toBeUndefined();
  });
});

describe('number & currency format options', () => {
  it('maps number styles to Intl notation options', () => {
    expect(numberFormatOptions('compact')).toEqual({
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    expect(numberFormatOptions('engineering').notation).toBe('engineering');
    expect(numberFormatOptions('scientific').notation).toBe('scientific');
    expect(numberFormatOptions('standard')).toEqual({ useGrouping: true });
    expect(numberFormatOptions('auto')).toEqual({});
  });

  it('currency display auto omits the option; explicit values pass through', () => {
    expect(currencyFormatOptions('auto')).toEqual({});
    expect(currencyFormatOptions('code')).toEqual({ currencyDisplay: 'code' });
    expect(currencyFormatOptions('name')).toEqual({ currencyDisplay: 'name' });
  });
});

describe('locale test-id builders', () => {
  it('builds stable timezone test ids', () => {
    expect(timeZoneTestId('America/New_York')).toBe('time-zone-America_New_York');
  });

  it('builds stable format-locale test ids', () => {
    expect(formatLocaleTestId('ja-JP')).toBe('format-locale-ja_JP');
  });
});
