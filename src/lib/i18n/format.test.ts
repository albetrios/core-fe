import { describe, expect, it } from 'vitest';

import {
  formatCurrencyValue,
  formatDateValue,
  formatNumberValue,
  type LocaleFormatInput,
} from '@/lib/i18n/format.ts';

/** Build a full prefs object; formatting keys off `formatLocale` (region). */
function prefs(overrides: Partial<LocaleFormatInput> = {}): LocaleFormatInput {
  return {
    locale: 'en',
    formatLocale: 'en-US',
    dateFormat: 'auto',
    hourCycle: 'auto',
    timeZone: 'auto',
    numberStyle: 'auto',
    currencyDisplay: 'auto',
    currencyCode: 'USD',
    ...overrides,
  };
}

describe('formatDateValue', () => {
  const sample = '2026-06-25T14:30:45.000Z';

  it('formats full datetime per region (auto)', () => {
    const us = formatDateValue(sample, prefs({ formatLocale: 'en-US' }));
    const jp = formatDateValue(sample, prefs({ formatLocale: 'ja-JP' }));
    expect(us).toMatch(/\d/);
    expect(jp).toMatch(/\d/);
    expect(us).not.toBe(jp);
  });

  it('formats date-only and time-only parts', () => {
    const dateOnly = formatDateValue(sample, prefs({ dateFormat: 'date' }));
    const timeOnly = formatDateValue(sample, prefs({ dateFormat: 'time' }));
    expect(dateOnly).toMatch(/\d/);
    expect(timeOnly).toMatch(/\d/);
    expect(dateOnly).not.toContain(':');
  });

  it('overrides display timezone when an IANA zone is selected', () => {
    const tokyo = formatDateValue(
      sample,
      prefs({ dateFormat: 'time', hourCycle: 'h23', timeZone: 'Asia/Tokyo' }),
    );
    const nyc = formatDateValue(
      sample,
      prefs({ dateFormat: 'time', hourCycle: 'h23', timeZone: 'America/New_York' }),
    );
    expect(tokyo).toMatch(/\d/);
    expect(nyc).toMatch(/\d/);
    expect(tokyo).not.toBe(nyc);
  });

  it('keeps the civil day for local Date inputs under a foreign display TZ', () => {
    // Calendar/placeholder events use local-midnight Dates. A western TZ must
    // not shift June 18 → June 17 (the bug that shipped with timeZone wiring).
    const civil = new Date(2026, 5, 18);
    const label = formatDateValue(
      civil,
      prefs({
        formatLocale: 'en-US',
        dateFormat: 'date',
        timeZone: 'America/New_York',
      }),
    );
    expect(label).toMatch(/06\/18\/2026|6\/18\/2026/);
  });

  it('still shifts absolute ISO instants across display timezones', () => {
    const tokyo = formatDateValue(
      '2026-06-18T00:30:00.000Z',
      prefs({ dateFormat: 'date', timeZone: 'Asia/Tokyo' }),
    );
    const nyc = formatDateValue(
      '2026-06-18T00:30:00.000Z',
      prefs({ dateFormat: 'date', timeZone: 'America/New_York' }),
    );
    expect(tokyo).not.toBe(nyc);
  });

  it('applies custom options while still honouring format locale + timezone', () => {
    const label = formatDateValue(
      sample,
      prefs({ formatLocale: 'en-IN', timeZone: 'Asia/Kolkata' }),
      { weekday: 'long', month: 'long', day: 'numeric' },
    );
    expect(label).toMatch(/\d/);
    expect(label.length).toBeGreaterThan(5);
  });
});

describe('formatCurrencyValue', () => {
  it('localizes currency by region', () => {
    const us = formatCurrencyValue(9900, 'USD', prefs({ formatLocale: 'en-US' }));
    const jp = formatCurrencyValue(9900, 'JPY', prefs({ formatLocale: 'ja-JP' }));
    expect(us).toMatch(/\$/);
    expect(jp).toMatch(/[\d¥]/);
  });

  it('does not throw on a malformed server currency code (falls back gracefully)', () => {
    // Intl.NumberFormat throws RangeError on a non-alpha-3 currency; the billing
    // UI must never crash over one bad server value.
    for (const bad of ['US', 'USDD', '$$', '12']) {
      expect(() => formatCurrencyValue(1299, bad, prefs())).not.toThrow();
      expect(formatCurrencyValue(1299, bad, prefs())).toContain('12.99');
    }
  });
});

describe('formatNumberValue', () => {
  it('localizes numbers by region', () => {
    const us = formatNumberValue(1284.5, prefs({ formatLocale: 'en-US' }));
    const de = formatNumberValue(1284.5, prefs({ formatLocale: 'de-DE' }));
    expect(us).toMatch(/1/);
    expect(de).toMatch(/1/);
    expect(us).not.toBe(de);
  });
});
