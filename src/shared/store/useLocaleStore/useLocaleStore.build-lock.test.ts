import { beforeEach, describe, expect, it, vi } from 'vitest';

// Single-locale build profile — exercises the applyBuildUiLocaleLock rehydrate
// path, which multi-locale test builds otherwise never reach.
vi.mock('@/lib/i18n/i18n-resources.ts', () => ({
  getBuildLocaleProfile: () => ({
    locale: 'de',
    formatLocale: 'de-DE',
    dateFormat: 'auto',
    hourCycle: 'auto',
    numberStyle: 'auto',
    currencyDisplay: 'auto',
    currencyCode: 'EUR',
  }),
}));

vi.mock('@/lib/i18n/apply-document-locale.ts', () => ({
  applyDocumentLocale: vi.fn().mockResolvedValue(undefined),
  applyDocumentDirection: vi.fn(),
}));

describe('useLocaleStore single-locale build lock', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('pins the UI language after hydration without breaking hasHydrated', async () => {
    // Import AFTER mocks so create() runs against the single-locale profile.
    // The lock is deferred a microtask: applying it synchronously inside
    // create() is a TDZ ReferenceError on the store binding that zustand's
    // hydration chain swallows, leaving hasHydrated() false forever.
    const { useLocaleStore } = await import('./useLocaleStore.ts');

    // Flush the deferred queueMicrotask lock.
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });

    expect(useLocaleStore.persist.hasHydrated()).toBe(true);
    expect(useLocaleStore.getState().locale).toBe('de');
  });
});
