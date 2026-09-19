import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

import { initDeferredIconSets, loadIconSet, useIconSet } from './icon-registry.ts';

const TABLER_STUB = { Boxes: (() => null) as never };
const PHOSPHOR_STUB = { Boxes: (() => null) as never };

vi.mock('./iconset-tabler.ts', () => ({ iconSet: TABLER_STUB }));
vi.mock('./iconset-phosphor.ts', () => ({ iconSet: PHOSPHOR_STUB }));
vi.mock('@/lib/app-splash.ts', () => ({
  afterPaint: (cb: () => void) => cb(),
}));

describe('icon-registry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAuthStore.setState({ isAuthenticated: false, isLoading: false });
    useThemeStore.setState({ iconLibrary: 'lucide' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('useIconSet returns null for lucide (the always-loaded default)', () => {
    const { result } = renderHook(() => useIconSet('lucide'));
    expect(result.current).toBeNull();
  });

  it('loadIconSet ignores lucide and unknown libraries', () => {
    loadIconSet('lucide');
    loadIconSet('does-not-exist');

    const { result } = renderHook(() => useIconSet('does-not-exist'));
    expect(result.current).toBeNull();
  });

  it('loading tabler resolves the lazy set and notifies subscribed hooks', async () => {
    vi.useRealTimers(); // dynamic import resolution needs real microtasks
    const { result } = renderHook(() => useIconSet('tabler'));
    expect(result.current).toBeNull();

    loadIconSet('tabler');

    await waitFor(() => expect(result.current).toBe(TABLER_STUB));
    // Second call is a cache no-op — the set identity is stable.
    loadIconSet('tabler');
    expect(result.current).toBe(TABLER_STUB);
  });

  it('initDeferredIconSets loads the alt set once the session becomes authenticated', async () => {
    useThemeStore.setState({ iconLibrary: 'phosphor' });
    initDeferredIconSets();

    const { result } = renderHook(() => useIconSet('phosphor'));
    expect(result.current).toBeNull();

    // Sign-in transition → afterPaint (sync mock) → setTimeout fallback (no rIC in jsdom).
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    vi.advanceTimersByTime(2000);

    vi.useRealTimers();
    await waitFor(() => expect(result.current).toBe(PHOSPHOR_STUB));
  });

  it('switching the icon library while signed in loads the new set immediately', async () => {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    initDeferredIconSets();
    vi.useRealTimers();

    useThemeStore.setState({ iconLibrary: 'tabler' });

    const { result } = renderHook(() => useIconSet('tabler'));
    await waitFor(() => expect(result.current).toBe(TABLER_STUB));
  });
});
