import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

import { useLocaleFormat } from './useLocaleFormat.ts';

describe('useLocaleFormat', () => {
  afterEach(() => {
    useLocaleStore.setState({
      locale: 'en',
      formatLocale: 'en-US',
      dateFormat: 'auto',
      hourCycle: 'auto',
      timeZone: 'auto',
      textDirection: 'auto',
      numberStyle: 'auto',
      currencyDisplay: 'auto',
      currencyCode: 'USD',
    });
  });

  it('formats currency with the active currency code', () => {
    useLocaleStore.setState({ formatLocale: 'en-US', currencyCode: 'USD' });
    const { result } = renderHook(() => useLocaleFormat());
    expect(result.current.formatCurrency(9900)).toContain('99');
  });

  it('exposes the derived locale experience for the active region', () => {
    useLocaleStore.setState({ locale: 'en', formatLocale: 'en-US' });
    const { result } = renderHook(() => useLocaleFormat());
    expect(result.current.direction).toBe('ltr');
    expect(result.current.firstDayOfWeek).toBe('sunday');
    expect(result.current.measurementSystem).toBe('imperial');
  });

  it('reflects a right-to-left language and a metric region', () => {
    const { result, rerender } = renderHook(() => useLocaleFormat());
    act(() => {
      useLocaleStore.setState({
        locale: 'ar',
        formatLocale: 'de-DE',
        textDirection: 'auto',
      });
    });
    rerender();
    expect(result.current.direction).toBe('rtl');
    expect(result.current.firstDayOfWeek).toBe('monday');
    expect(result.current.measurementSystem).toBe('metric');
  });

  it('honours a forced LTR direction preference over Arabic', () => {
    useLocaleStore.setState({ locale: 'ar', textDirection: 'ltr' });
    const { result } = renderHook(() => useLocaleFormat());
    expect(result.current.direction).toBe('ltr');
  });

  it('formats dates in the selected timezone', () => {
    const sample = '2026-06-25T14:30:45.000Z';
    useLocaleStore.setState({
      formatLocale: 'en-US',
      dateFormat: 'time',
      hourCycle: 'h23',
      timeZone: 'Asia/Tokyo',
    });
    const { result, rerender } = renderHook(() => useLocaleFormat());
    const tokyo = result.current.formatDate(sample);
    act(() => {
      useLocaleStore.setState({ timeZone: 'America/New_York' });
    });
    rerender();
    const nyc = result.current.formatDate(sample);
    expect(tokyo).not.toBe(nyc);
  });
});
