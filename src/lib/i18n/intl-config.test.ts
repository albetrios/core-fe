import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TEXT_DIRECTION,
  isDateFormatPreference,
  normalizeDateFormatPreference,
  normalizeTextDirectionPreference,
  resolvedTextDirection,
} from './intl-config.ts';

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
