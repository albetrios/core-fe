import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyDocumentLocale } from '@/lib/i18n/apply-document-locale.ts';
import i18n from '@/lib/i18n/i18n.ts';

// Single-locale startup must wait for copy while preserving regional preferences.
vi.mock('@/lib/i18n/i18n-resources.ts', () => ({
  I18N_BUILD_UI_LOCALE: 'de',
  getBootstrapResources: () => ({ de: { common: {} } }),
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
    vi.mocked(applyDocumentLocale).mockReset().mockResolvedValue(undefined);
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
    await vi.waitFor(() => expect(useLocaleStore.getState().isLocaleReady).toBe(true));
  });

  it('waits for locked-language copy without resetting regional preferences', async () => {
    const { useLocaleStore } = await import('./useLocaleStore.ts');
    let release!: () => void;
    vi.mocked(applyDocumentLocale).mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    useLocaleStore.setState({
      isLocaleReady: false,
      locale: 'en',
      formatLocale: 'ja-JP',
      currencyCode: 'JPY',
      timeZone: 'Asia/Kolkata',
    });
    const finish = useLocaleStore.persist
      .getOptions()
      .onRehydrateStorage?.(useLocaleStore.getState());
    finish?.(useLocaleStore.getState());
    await Promise.resolve();
    expect(useLocaleStore.getState().isLocaleReady).toBe(false);
    release();
    await vi.waitFor(() => expect(useLocaleStore.getState().isLocaleReady).toBe(true));
    expect(useLocaleStore.getState()).toMatchObject({
      locale: 'de',
      formatLocale: 'ja-JP',
      currencyCode: 'JPY',
      timeZone: 'Asia/Kolkata',
    });
  });

  it('recovers to the bundled build language, not English, on startup failure', async () => {
    const { useLocaleStore } = await import('./useLocaleStore.ts');
    vi.mocked(applyDocumentLocale).mockRejectedValue(new Error('chunk failed'));
    useLocaleStore.setState({ isLocaleReady: false, locale: 'ar', textDirection: 'rtl' });
    const finish = useLocaleStore.persist
      .getOptions()
      .onRehydrateStorage?.(useLocaleStore.getState());
    finish?.(useLocaleStore.getState());
    await vi.waitFor(() => expect(useLocaleStore.getState().isLocaleReady).toBe(true));
    expect(useLocaleStore.getState().locale).toBe('de');
    expect(i18n.language).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });
});
