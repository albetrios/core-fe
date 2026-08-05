import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TEXT_DIRECTION,
  DEFAULT_TIME_ZONE,
  isDateFormatPreference,
  isTimeZonePreference,
  normalizeDateFormatPreference,
  normalizeTextDirectionPreference,
  normalizeTimeZonePreference,
  resolvedTextDirection,
  resolvedTimeZone,
} from './intl-config.ts';
import { formatLocaleTestId, timeZoneTestId } from './locale.constants.ts';

describe('isDateFormatPreference', () => {
  it('accepts a known preference', () => {
    expect(isDateFormatPreference('short')).toBe(true);
    expect(isDateFormatPreference('datetime')).toBe(true);
  });

  it('rejects an unknown value', () => {
    expect(isDateFormatPreference('nope')).toBe(false);
    expect(isDateFormatPreference('')).toBe(false);
  });
});

describe('normalizeDateFormatPreference', () => {
  it('keeps a known preference', () => {
    expect(normalizeDateFormatPreference('long')).toBe('long');
  });

  it('falls back to the default for an unknown value', () => {
    expect(normalizeDateFormatPreference('bogus')).toBe(DEFAULT_DATE_FORMAT);
  });

  it('falls back to the default when the value is missing', () => {
    expect(normalizeDateFormatPreference(undefined)).toBe(DEFAULT_DATE_FORMAT);
  });
});

describe('resolvedTextDirection', () => {
  it('follows the language when preference is auto', () => {
    expect(resolvedTextDirection('auto', 'ar')).toBe('rtl');
    expect(resolvedTextDirection('auto', 'en')).toBe('ltr');
  });

  it('forces LTR even for Arabic', () => {
    expect(resolvedTextDirection('ltr', 'ar')).toBe('ltr');
  });

  it('forces RTL even for English', () => {
    expect(resolvedTextDirection('rtl', 'en')).toBe('rtl');
  });
});

describe('normalizeTextDirectionPreference', () => {
  it('keeps a known preference', () => {
    expect(normalizeTextDirectionPreference('rtl')).toBe('rtl');
  });

  it('falls back to auto for unknown values', () => {
    expect(normalizeTextDirectionPreference('sideways')).toBe(DEFAULT_TEXT_DIRECTION);
    expect(normalizeTextDirectionPreference(undefined)).toBe(DEFAULT_TEXT_DIRECTION);
  });
});

describe('timezone preferences', () => {
  it('accepts known IANA zones and rejects unknowns', () => {
    expect(isTimeZonePreference('UTC')).toBe(true);
    expect(isTimeZonePreference('Asia/Tokyo')).toBe(true);
    expect(isTimeZonePreference('Not/A/Zone')).toBe(false);
  });

  it('normalizes unknown values to auto', () => {
    expect(normalizeTimeZonePreference('UTC')).toBe('UTC');
    expect(normalizeTimeZonePreference('bogus')).toBe(DEFAULT_TIME_ZONE);
    expect(normalizeTimeZonePreference(undefined)).toBe(DEFAULT_TIME_ZONE);
  });

  it('resolves auto to undefined for Intl', () => {
    expect(resolvedTimeZone('auto')).toBeUndefined();
    expect(resolvedTimeZone('Europe/London')).toBe('Europe/London');
  });

  it('builds stable timezone test ids', () => {
    expect(timeZoneTestId('America/New_York')).toBe('time-zone-America_New_York');
  });

  it('builds stable format-locale test ids', () => {
    expect(formatLocaleTestId('ja-JP')).toBe('format-locale-ja_JP');
  });
});
