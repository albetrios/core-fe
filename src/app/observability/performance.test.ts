import type { Metric } from 'web-vitals';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';

import { initPerformanceMonitoring } from './performance.ts';

const { captureMessageMock } = vi.hoisted(() => ({ captureMessageMock: vi.fn() }));

vi.mock('web-vitals', () => ({
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onFCP: vi.fn(),
  onTTFB: vi.fn(),
}));
vi.mock('@/shared/analytics/capture.ts', () => ({
  captureAnalyticsEvent: vi.fn(),
}));
vi.mock('@sentry/react', () => ({ captureMessage: captureMessageMock }));

function metric(overrides: Partial<Metric>): Metric {
  return {
    name: 'LCP',
    value: 1200,
    rating: 'good',
    delta: 1200,
    navigationType: 'navigate',
    id: 'v1',
    entries: [],
    ...overrides,
  } as unknown as Metric;
}

describe('initPerformanceMonitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to all five Core Web Vitals', () => {
    initPerformanceMonitoring();

    for (const register of [onCLS, onINP, onLCP, onFCP, onTTFB]) {
      expect(register).toHaveBeenCalledTimes(1);
    }
  });

  it('reports each metric to analytics with the full payload', () => {
    initPerformanceMonitoring();
    const report = vi.mocked(onLCP).mock.calls[0]?.[0];

    report?.(metric({ name: 'LCP', value: 987.6, rating: 'good' }));

    expect(captureAnalyticsEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        name: 'LCP',
        value: 987.6,
        rating: 'good',
        navigationType: 'navigate',
      }),
    );
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('escalates poor ratings to Sentry as warnings', async () => {
    initPerformanceMonitoring();
    const report = vi.mocked(onINP).mock.calls[0]?.[0];

    report?.(metric({ name: 'INP', value: 900, rating: 'poor' }));

    await vi.waitFor(() =>
      expect(captureMessageMock).toHaveBeenCalledWith(
        'Poor Web Vital: INP = 900',
        expect.objectContaining({
          level: 'warning',
          tags: { webVital: 'INP', rating: 'poor' },
        }),
      ),
    );
  });
});
