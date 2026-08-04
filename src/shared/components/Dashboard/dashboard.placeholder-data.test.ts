import { describe, expect, it } from 'vitest';

import { buildAnalyticsSeries } from './dashboard.placeholder-data.ts';

describe('buildAnalyticsSeries', () => {
  it('uses the default en-US axis label when no formatter is supplied', () => {
    const series = buildAnalyticsSeries('7d', new Date('2026-06-25T12:00:00.000Z'));
    expect(series.length).toBeGreaterThan(0);
    expect(series[0]?.label).toMatch(/[A-Za-z]{3}\s+\d{1,2}/);
  });

  it('uses a custom formatLabel when provided', () => {
    const series = buildAnalyticsSeries(
      '7d',
      new Date('2026-06-25T12:00:00.000Z'),
      () => 'X',
    );
    expect(series.every((point) => point.label === 'X')).toBe(true);
  });
});
