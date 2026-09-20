import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as localeApplication from '@/lib/i18n/apply-document-locale.ts';
import { applyDocumentLocale } from '@/lib/i18n/apply-document-locale.ts';
import i18n from '@/lib/i18n/i18n.ts';
import * as namespaceLoader from '@/lib/i18n/load-namespace.ts';
import { ensureNamespace } from '@/lib/i18n/load-namespace.ts';
import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';

import { localeFormatPrefs, useLocaleStore } from './useLocaleStore.ts';

describe('useLocaleStore', () => {
  beforeEach(async () => {
    useLocaleStore.setState({
      locale: 'en',
      dateFormat: 'auto',
      textDirection: 'auto',
    });
    await applyDocumentLocale('en', 'auto');
  });

  it('persists and applies a new locale', async () => {
    await ensureNamespace('en', I18N_NAMESPACES.auth);
    await useLocaleStore.getState().setLocale('zh');
    expect(useLocaleStore.getState().locale).toBe('zh');
    expect(i18n.language).toBe('zh');
    expect(document.documentElement.lang).toBe('zh');
    expect(i18n.t('mfa.heading', { ns: I18N_NAMESPACES.auth })).toBe('双因素认证');
  });

  it('switching to Arabic flips the document direction to RTL', async () => {
    await useLocaleStore.getState().setLocale('ar');
    expect(document.documentElement.dir).toBe('rtl');
    await useLocaleStore.getState().setLocale('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('text direction preference overrides language without changing locale', () => {
    useLocaleStore.getState().setTextDirection('rtl');
    expect(useLocaleStore.getState().textDirection).toBe('rtl');
    expect(useLocaleStore.getState().locale).toBe('en');
    expect(document.documentElement.dir).toBe('rtl');
    useLocaleStore.getState().setTextDirection('ltr');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('forced LTR keeps Arabic UI from flipping the document', async () => {
    useLocaleStore.getState().setTextDirection('ltr');
    await useLocaleStore.getState().setLocale('ar');
    expect(useLocaleStore.getState().locale).toBe('ar');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('language carries a regional currency (full locale experience)', async () => {
    await useLocaleStore.getState().setLocale('hi');
    expect(useLocaleStore.getState().formatLocale).toBe('hi-IN');
    expect(useLocaleStore.getState().currencyCode).toBe('INR');
  });

  it('changing the region snaps the currency to that region', () => {
    useLocaleStore.getState().setFormatLocale('ja-JP');
    expect(useLocaleStore.getState().currencyCode).toBe('JPY');
    useLocaleStore.getState().setFormatLocale('de-DE');
    expect(useLocaleStore.getState().currencyCode).toBe('EUR');
  });

  it('stores date format preference independently', () => {
    useLocaleStore.getState().setDateFormat('date');
    expect(useLocaleStore.getState().dateFormat).toBe('date');
  });

  it('stores expanded regional preferences', () => {
    useLocaleStore.getState().setHourCycle('h23');
    useLocaleStore.getState().setNumberStyle('compact');
    useLocaleStore.getState().setCurrencyDisplay('code');
    expect(useLocaleStore.getState().hourCycle).toBe('h23');
    expect(useLocaleStore.getState().numberStyle).toBe('compact');
    expect(useLocaleStore.getState().currencyDisplay).toBe('code');
  });

  it('stores timezone preference independently of region changes', () => {
    useLocaleStore.getState().setTimeZone('UTC');
    expect(useLocaleStore.getState().timeZone).toBe('UTC');
    useLocaleStore.getState().setFormatLocale('ja-JP');
    expect(useLocaleStore.getState().timeZone).toBe('UTC');
    useLocaleStore.getState().setFormatLocale('en-IN');
    expect(useLocaleStore.getState().timeZone).toBe('UTC');
  });

  it('keeps device timezone (auto) when the region changes', () => {
    useLocaleStore.setState({ timeZone: 'auto' });
    useLocaleStore.getState().setFormatLocale('ja-JP');
    expect(useLocaleStore.getState().timeZone).toBe('auto');
  });

  it('does not clobber an explicit timezone when the UI language changes', async () => {
    useLocaleStore.getState().setTimeZone('UTC');
    await useLocaleStore.getState().setLocale('ja');
    expect(useLocaleStore.getState().locale).toBe('ja');
    expect(useLocaleStore.getState().formatLocale).toBe('ja-JP');
    expect(useLocaleStore.getState().timeZone).toBe('UTC');
  });

  it('keeps device timezone (auto) when the UI language changes', async () => {
    useLocaleStore.setState({ timeZone: 'auto' });
    await useLocaleStore.getState().setLocale('hi');
    expect(useLocaleStore.getState().timeZone).toBe('auto');
  });

  it('stores a currency code override independently', () => {
    useLocaleStore.getState().setCurrencyCode('EUR');
    expect(useLocaleStore.getState().currencyCode).toBe('EUR');
  });
});

describe('useLocaleStore — persistence contract', () => {
  it('migrate falls back to full defaults for non-object persisted state', () => {
    const migrate = useLocaleStore.persist.getOptions().migrate;
    const migrated = migrate?.(null, 3) as Record<string, unknown>;

    expect(migrated.locale).toBe('en');
    expect(migrated.dateFormat).toBe('auto');
    expect(migrated.timeZone).toBe('auto');
    expect(migrated.textDirection).toBe('auto');
  });

  it('migrate normalizes every corrupted field to a safe value', () => {
    const migrate = useLocaleStore.persist.getOptions().migrate;
    const migrated = migrate?.(
      {
        locale: 'klingon',
        formatLocale: 'not-a-tag',
        dateFormat: 'weird',
        hourCycle: '13h',
        timeZone: 42,
        textDirection: 'sideways',
        numberStyle: 'roman',
        currencyDisplay: 'seashells',
        currencyCode: 'not-a-code',
      },
      6,
    ) as Record<string, unknown>;

    expect(migrated.locale).toBe('en');
    expect(typeof migrated.formatLocale).toBe('string');
    expect(migrated.dateFormat).toBe('auto');
    expect(migrated.hourCycle).toBe('auto');
    expect(migrated.timeZone).toBe('auto');
    expect(migrated.textDirection).toBe('auto');
    expect(migrated.numberStyle).toBe('auto');
    expect(migrated.currencyDisplay).toBe('auto');
    expect(typeof migrated.currencyCode).toBe('string');
    expect(migrated.currencyCode).not.toBe('not-a-code');
  });

  it('migrate preserves a valid persisted preference set', () => {
    const migrate = useLocaleStore.persist.getOptions().migrate;
    const migrated = migrate?.(
      {
        locale: 'ar',
        dateFormat: 'iso',
        textDirection: 'ltr',
        timeZone: 'Asia/Kolkata',
      },
      6,
    ) as Record<string, unknown>;

    expect(migrated.locale).toBe('ar');
    expect(migrated.dateFormat).toBe('iso');
    expect(migrated.textDirection).toBe('ltr');
    expect(migrated.timeZone).toBe('Asia/Kolkata');
  });

  it('rehydration re-applies the persisted locale to the document', async () => {
    const onRehydrate = useLocaleStore.persist.getOptions().onRehydrateStorage;
    const apply = onRehydrate?.(useLocaleStore.getState());

    apply?.({ ...useLocaleStore.getState(), locale: 'ar', textDirection: 'auto' });

    await vi.waitFor(() => {
      expect(document.documentElement.lang).toBe('ar');
      expect(document.documentElement.dir).toBe('rtl');
    });

    // Restore for neighbouring suites.
    await applyDocumentLocale('en', 'auto');
  });

  it('localeFormatPrefs projects exactly the Intl-relevant fields', () => {
    const prefs = localeFormatPrefs({
      locale: 'en',
      formatLocale: 'en-GB',
      dateFormat: 'iso',
      hourCycle: 'h23',
      timeZone: 'UTC',
      numberStyle: 'auto',
      currencyDisplay: 'symbol',
      currencyCode: 'GBP',
    });

    expect(prefs).toEqual({
      locale: 'en',
      formatLocale: 'en-GB',
      dateFormat: 'iso',
      hourCycle: 'h23',
      timeZone: 'UTC',
      numberStyle: 'auto',
      currencyDisplay: 'symbol',
      currencyCode: 'GBP',
    });
  });
});

function deferredLocale() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('initial locale readiness', () => {
  beforeEach(async () => {
    await vi.waitFor(() => expect(useLocaleStore.getState().isLocaleReady).toBe(true));
    await i18n.changeLanguage('en');
    useLocaleStore.setState({
      locale: 'ar',
      isLocaleReady: false,
      formatLocale: 'ja-JP',
      currencyCode: 'JPY',
      timeZone: 'Asia/Kolkata',
      dateFormat: 'iso',
      textDirection: 'ltr',
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await useLocaleStore.getState().recoverInitialLocale();
  });

  function hydrate() {
    const finish = useLocaleStore.persist
      .getOptions()
      .onRehydrateStorage?.(useLocaleStore.getState());
    finish?.(useLocaleStore.getState());
  }

  it('does not mark synchronous storage hydration as translation readiness', async () => {
    const pending = deferredLocale();
    vi.spyOn(localeApplication, 'applyDocumentLocale').mockReturnValue(pending.promise);
    hydrate();
    await Promise.resolve();
    expect(useLocaleStore.persist.hasHydrated()).toBe(true);
    expect(useLocaleStore.getState().isLocaleReady).toBe(false);
    pending.resolve();
    await vi.waitFor(() => expect(useLocaleStore.getState().isLocaleReady).toBe(true));
    expect(useLocaleStore.getState()).toMatchObject({
      locale: 'ar',
      formatLocale: 'ja-JP',
      currencyCode: 'JPY',
      timeZone: 'Asia/Kolkata',
    });
  });

  it('recovers rejected startup copy without changing regional preferences', async () => {
    vi.spyOn(localeApplication, 'applyDocumentLocale').mockRejectedValue(
      new Error('chunk failed'),
    );
    hydrate();
    await vi.waitFor(() => expect(useLocaleStore.getState().isLocaleReady).toBe(true));
    expect(useLocaleStore.getState()).toMatchObject({
      locale: 'en',
      formatLocale: 'ja-JP',
      currencyCode: 'JPY',
      timeZone: 'Asia/Kolkata',
      dateFormat: 'iso',
      textDirection: 'ltr',
    });
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('recovers storage failure before any locale application', async () => {
    const apply = vi.spyOn(localeApplication, 'applyDocumentLocale');
    const finish = useLocaleStore.persist
      .getOptions()
      .onRehydrateStorage?.(useLocaleStore.getState());
    finish?.(undefined, new Error('storage unavailable'));
    await vi.waitFor(() => expect(useLocaleStore.getState().isLocaleReady).toBe(true));
    expect(apply).not.toHaveBeenCalled();
    expect(useLocaleStore.getState().locale).toBe('en');
  });

  it('invalidates pending startup work when deadline recovery wins', async () => {
    const pending = deferredLocale();
    const original = localeApplication.applyDocumentLocale;
    const apply = vi
      .spyOn(localeApplication, 'applyDocumentLocale')
      .mockImplementation(async (...args) => {
        await pending.promise;
        await original(...args);
      });
    hydrate();
    await Promise.resolve();
    await useLocaleStore.getState().recoverInitialLocale();
    pending.resolve();
    await apply.mock.results[0]?.value;
    expect(useLocaleStore.getState()).toMatchObject({
      locale: 'en',
      isLocaleReady: true,
    });
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('ignores a stale startup rejection after an interactive choice', async () => {
    const pending = deferredLocale();
    vi.spyOn(localeApplication, 'applyDocumentLocale')
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(undefined);
    hydrate();
    await Promise.resolve();
    await useLocaleStore.getState().setLocale('fr');
    pending.reject(new Error('old startup failed'));
    await Promise.resolve();
    await Promise.resolve();
    expect(useLocaleStore.getState()).toMatchObject({
      locale: 'fr',
      isLocaleReady: true,
    });
  });

  it('keeps readiness true while switching and lets the latest choice win', async () => {
    const first = deferredLocale();
    const second = deferredLocale();
    vi.spyOn(localeApplication, 'applyDocumentLocale')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    useLocaleStore.setState({ isLocaleReady: true, locale: 'en' });
    const older = useLocaleStore.getState().setLocale('ar');
    const newer = useLocaleStore.getState().setLocale('fr');
    expect(useLocaleStore.getState().isLocaleReady).toBe(true);
    second.resolve();
    await newer;
    first.resolve();
    await older;
    expect(useLocaleStore.getState()).toMatchObject({
      locale: 'fr',
      isLocaleReady: true,
    });
  });

  it('does not change an already-ready interactive locale during recovery', async () => {
    useLocaleStore.setState({ locale: 'fr', isLocaleReady: true });
    const change = vi.spyOn(i18n, 'changeLanguage');
    await useLocaleStore.getState().recoverInitialLocale();
    expect(change).not.toHaveBeenCalled();
    expect(useLocaleStore.getState().locale).toBe('fr');
  });

  it('does not let late storage overwrite recovered language or readiness', async () => {
    const previousStorage = useLocaleStore.persist.getOptions().storage;
    const stored = {
      state: {
        ...useLocaleStore.getState(),
        locale: 'ar' as const,
        timeZone: 'UTC' as const,
        textDirection: 'rtl' as const,
      },
      version: 7,
    };
    let release!: (value: typeof stored) => void;
    useLocaleStore.persist.setOptions({
      storage: {
        getItem: () =>
          new Promise<typeof stored>((resolve) => {
            release = resolve;
          }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });
    try {
      const hydration = useLocaleStore.persist.rehydrate();
      await useLocaleStore.getState().recoverInitialLocale();
      release(stored);
      await hydration;
      await Promise.resolve();
      expect(useLocaleStore.getState()).toMatchObject({
        locale: 'en',
        isLocaleReady: true,
        timeZone: 'UTC',
        formatLocale: 'ja-JP',
      });
      expect(i18n.language).toBe('en');
      expect(document.documentElement.dir).toBe('rtl');
    } finally {
      useLocaleStore.persist.setOptions({ storage: previousStorage });
    }
  });

  it('does not persist runtime readiness or recovery actions', () => {
    const persisted = useLocaleStore.persist
      .getOptions()
      .partialize?.(useLocaleStore.getState());
    expect(persisted).not.toHaveProperty('isLocaleReady');
    expect(persisted).not.toHaveProperty('recoverInitialLocale');
  });

  it('cancels pending loader transitions on hydration, interactive choice, and recovery', async () => {
    const cancel = vi.spyOn(namespaceLoader, 'cancelLocaleTransition');
    vi.spyOn(localeApplication, 'applyDocumentLocale').mockResolvedValue(undefined);
    hydrate();
    await vi.waitFor(() => expect(useLocaleStore.getState().isLocaleReady).toBe(true));
    expect(cancel).toHaveBeenCalledTimes(1);
    await useLocaleStore.getState().setLocale('fr');
    expect(cancel).toHaveBeenCalledTimes(2);
    useLocaleStore.setState({ isLocaleReady: false });
    await useLocaleStore.getState().recoverInitialLocale();
    expect(cancel).toHaveBeenCalledTimes(3);
  });
});
