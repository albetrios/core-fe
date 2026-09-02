import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedSearch, useDebouncedValue } from './useDebouncedValue.ts';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('updates only after the delay elapses without further changes', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'a' },
    });

    rerender({ v: 'ab' });
    rerender({ v: 'abc' });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('abc');
  });

  it('resets the timer on each change (only the final value lands)', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'x' },
    });

    rerender({ v: 'xy' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ v: 'xyz' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // 400ms total elapsed, but only 200ms since the last change → not yet.
    expect(result.current).toBe('x');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('xyz');
  });
});

describe('useDebouncedSearch', () => {
  // The rows on screen answer the PREVIOUS query for as long as the debounce
  // is catching up. `keepPreviousData` keeps them there (X-2); this flag is how
  // a panel says they are not current yet — from the first keystroke, not a
  // beat later (SET-19).
  it('reports pending while the debounce catches up, then settles', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedSearch(value), {
      initialProps: { value: 'ada' },
    });

    expect(result.current).toEqual({ debounced: 'ada', isPending: false });

    rerender({ value: 'ada l' });
    expect(result.current.isPending).toBe(true);
    expect(result.current.debounced).toBe('ada');

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toEqual({ debounced: 'ada l', isPending: false });
    vi.useRealTimers();
  });

  it('trims, so trailing whitespace is not a new query', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedSearch(value), {
      initialProps: { value: 'ada' },
    });

    rerender({ value: 'ada  ' });
    expect(result.current.isPending).toBe(false);
    expect(result.current.debounced).toBe('ada');
    vi.useRealTimers();
  });
});
