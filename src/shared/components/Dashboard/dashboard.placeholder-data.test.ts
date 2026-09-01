import { describe, expect, it } from 'vitest';

import {
  buildAnalyticsSeries,
  buildDashboardTrends,
  DASHBOARD_PULSE_METRICS,
  DASHBOARD_SOURCE_SEGMENTS,
  dashboardPulseRatio,
  dashboardPulseScore,
  resolveDashboardActivity,
} from './dashboard.placeholder-data.ts';

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

describe('buildDashboardTrends', () => {
  it('is deterministic and agrees with the analytics series', () => {
    const reference = new Date('2026-06-25T12:00:00.000Z');
    const trends = buildDashboardTrends(reference);
    expect(trends.map((trend) => trend.id)).toEqual(['sessions', 'apiCalls', 'reviews']);
    const sessions = buildAnalyticsSeries('30d', reference).slice(-7);
    const lastWeek = sessions.reduce((sum, p) => sum + p.sessions, 0);
    expect(trends[0]?.value).toBe(lastWeek);
    for (const trend of trends) {
      expect(trend.points).toHaveLength(14);
      expect(Number.isFinite(trend.deltaPct)).toBe(true);
    }
    // Same reference → same output (seeded, no randomness).
    expect(buildDashboardTrends(reference)).toEqual(trends);
  });
});

describe('DASHBOARD_SOURCE_SEGMENTS', () => {
  it('covers web/mobile/api with positive values', () => {
    expect(DASHBOARD_SOURCE_SEGMENTS.map((s) => s.id)).toEqual(['web', 'mobile', 'api']);
    for (const segment of DASHBOARD_SOURCE_SEGMENTS) {
      expect(segment.value).toBeGreaterThan(0);
    }
  });
});

describe('resolveDashboardActivity', () => {
  it('resolves each seeded event to hoursAgo before the reference time', () => {
    const reference = new Date('2026-06-25T12:00:00.000Z');
    const events = resolveDashboardActivity(reference);
    expect(events).toHaveLength(4);
    for (const event of events) {
      expect(reference.getTime() - event.at.getTime()).toBe(event.hoursAgo * 3_600_000);
    }
    // Newest first, per the seed order.
    expect(events[0]?.hoursAgo).toBe(2);
  });
});

describe('dashboardPulseScore', () => {
  it('clamps each ratio to [0, 1] and guards zero targets', () => {
    expect(
      dashboardPulseRatio({ id: 'sessions', labelKey: 'x', value: 300, target: 100 }),
    ).toBe(1);
    expect(
      dashboardPulseRatio({ id: 'sessions', labelKey: 'x', value: -5, target: 100 }),
    ).toBe(0);
    expect(
      dashboardPulseRatio({ id: 'sessions', labelKey: 'x', value: 10, target: 0 }),
    ).toBe(0);
  });

  it('averages the seeded metrics into a stable percentage', () => {
    // 132/180 + 46/60 + 9/15 → mean 0.7 → 70.
    expect(dashboardPulseScore(DASHBOARD_PULSE_METRICS)).toBe(70);
    expect(dashboardPulseScore([])).toBe(0);
  });
});
