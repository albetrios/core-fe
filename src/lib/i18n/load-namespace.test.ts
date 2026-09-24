import { afterEach, describe, expect, it, vi } from 'vitest';

import * as buildEnv from '@/lib/i18n/build-env.ts';
import * as buildRuntime from '@/lib/i18n/build-runtime.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { I18N_BUILD_UI_LOCALE } from '@/lib/i18n/i18n-resources.ts';
import {
  ensureLocale,
  ensureNamespace,
  loadNamespaceModule,
  preloadLocaleIdle,
} from '@/lib/i18n/load-namespace.ts';
import { I18N_LOCALES } from '@/lib/i18n/locales.ts';
import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';

const ALL_NAMESPACES = Object.values(I18N_NAMESPACES);

/**
 * Wait for every load a stubbed loader started, including any a settling load
 * starts. `vi.resetModules()` gives a test a fresh load-namespace module but
 * not a fresh i18next, so a load released at the end of a test still installs
 * its bundle, and without this it lands inside whichever test runs next.
 */
async function settleLoads(loader: { mock: { results: Array<{ value: unknown }> } }) {
  let settled = 0;
  while (settled < loader.mock.results.length) {
    const started = loader.mock.results.slice(settled).map(({ value }) => value);
    settled += started.length;
    await Promise.allSettled(started);
  }
}

describe('load-namespace', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    // Some tests commit a language on the shared i18next instance. Put the
    // build UI locale back, or the next test's ensureNamespace also fetches
    // copy for that language.
    if (i18n.language !== I18N_BUILD_UI_LOCALE) {
      await i18n.changeLanguage(I18N_BUILD_UI_LOCALE);
    }
  });

  it('coalesces simultaneous requests for the same locale and namespace', async () => {
    i18n.removeResourceBundle('it', I18N_NAMESPACES.dashboard);
    const add = vi.spyOn(i18n, 'addResourceBundle');
    await Promise.all([
      ensureNamespace('it', I18N_NAMESPACES.dashboard),
      ensureNamespace('it', I18N_NAMESPACES.dashboard),
    ]);
    expect(
      add.mock.calls.filter(
        ([locale, ns]) => locale === 'it' && ns === I18N_NAMESPACES.dashboard,
      ),
    ).toHaveLength(1);
  });

  it('retries a namespace after a failed resource installation', async () => {
    i18n.removeResourceBundle('pt', I18N_NAMESPACES.auth);
    const add = vi.spyOn(i18n, 'addResourceBundle').mockImplementationOnce(() => {
      throw new Error('Resource installation failed');
    });
    await expect(ensureNamespace('pt', I18N_NAMESPACES.auth)).rejects.toThrow(
      'Resource installation failed',
    );
    await ensureNamespace('pt', I18N_NAMESPACES.auth);
    expect(add).toHaveBeenCalledTimes(2);
    expect(i18n.hasResourceBundle('pt', I18N_NAMESPACES.auth)).toBe(true);
  });

  it('runs the multi-locale loader under vitest', () => {
    expect(buildRuntime.isMultiLocaleBuild()).toBe(true);
  });

  it('lazy-loads the auth namespace for Spanish', async () => {
    await ensureNamespace('es', I18N_NAMESPACES.auth);
    expect(i18n.hasResourceBundle('es', I18N_NAMESPACES.auth)).toBe(true);
    expect(i18n.t('mfa.heading', { ns: I18N_NAMESPACES.auth, lng: 'es' })).toBe(
      'Autenticación en dos pasos',
    );
  });

  it('lazy-loads Chinese onboarding copy', async () => {
    await ensureNamespace('zh', I18N_NAMESPACES.onboarding);
    expect(
      i18n.t('steps.welcome.title', { ns: I18N_NAMESPACES.onboarding, lng: 'zh' }),
    ).toBe('欢迎加入');
  });

  it('invokes every explicit locale × namespace JSON loader', async () => {
    for (const locale of I18N_LOCALES) {
      for (const ns of ALL_NAMESPACES) {
        const bundle = await loadNamespaceModule(locale, ns);
        expect(bundle).toEqual(expect.any(Object));
        expect(Object.keys(bundle).length).toBeGreaterThan(0);
      }
    }
  });

  it('ensureLocale loads all namespaces for a locale', async () => {
    await ensureLocale('ar');
    for (const ns of ALL_NAMESPACES) {
      expect(i18n.hasResourceBundle('ar', ns)).toBe(true);
    }
  });

  it('is a no-op when the bundle is already loaded', async () => {
    await ensureNamespace('fr', I18N_NAMESPACES.common);
    await ensureNamespace('fr', I18N_NAMESPACES.common);
    expect(i18n.hasResourceBundle('fr', I18N_NAMESPACES.common)).toBe(true);
  });

  it('falls back to bootstrap bundles in single-locale builds', async () => {
    vi.spyOn(buildRuntime, 'isMultiLocaleBuild').mockReturnValue(false);
    await ensureNamespace('en', I18N_NAMESPACES.common);
    expect(i18n.hasResourceBundle('en', I18N_NAMESPACES.common)).toBe(true);
  });

  it('awaits deferred namespaces using only the selected locale in single mode', async () => {
    vi.spyOn(buildRuntime, 'isMultiLocaleBuild').mockReturnValue(false);
    i18n.removeResourceBundle('en', I18N_NAMESPACES.dashboard);
    const add = vi.spyOn(i18n, 'addResourceBundle');
    await ensureNamespace('es', I18N_NAMESPACES.dashboard);
    expect(add).toHaveBeenCalledWith(
      'en',
      I18N_NAMESPACES.dashboard,
      expect.any(Object),
      true,
      true,
    );
    expect(i18n.hasResourceBundle('en', I18N_NAMESPACES.dashboard)).toBe(true);
  });

  it('preloadLocaleIdle no-ops under Vitest', () => {
    const ric = vi.fn();
    vi.stubGlobal('requestIdleCallback', ric);
    preloadLocaleIdle('es');
    expect(ric).not.toHaveBeenCalled();
  });

  it('preloadLocaleIdle schedules when not in test mode', () => {
    vi.spyOn(buildEnv, 'readInjectedTestMode').mockReturnValue(false);
    const ric = vi.fn();
    vi.stubGlobal('requestIdleCallback', ric);
    preloadLocaleIdle('es');
    expect(ric).toHaveBeenCalled();
  });

  it('preloadLocaleIdle uses setTimeout when idle callback is missing', () => {
    vi.spyOn(buildEnv, 'readInjectedTestMode').mockReturnValue(false);
    const timeout = vi
      .spyOn(window, 'setTimeout')
      .mockImplementation(((_cb: TimerHandler) => 0) as typeof setTimeout);
    // Ensure requestIdleCallback is absent.
    vi.stubGlobal('requestIdleCallback', undefined);
    preloadLocaleIdle('de');
    expect(timeout).toHaveBeenCalled();
    timeout.mockRestore();
  });

  it('preloadLocaleIdle skips the active build UI locale', () => {
    vi.spyOn(buildEnv, 'readInjectedTestMode').mockReturnValue(false);
    const ric = vi.fn();
    vi.stubGlobal('requestIdleCallback', ric);
    preloadLocaleIdle('en');
    expect(ric).not.toHaveBeenCalled();
  });
  it('keeps route content deferred and switches only the active namespaces', async () => {
    vi.resetModules();
    const fresh = await import('@/lib/i18n/load-namespace.ts');
    const { default: freshI18n } = await import('@/lib/i18n/i18n.ts');
    await fresh.ensureActiveLocale('en');
    expect(
      freshI18n.t('panels.appearance.title', { ns: I18N_NAMESPACES.settings, lng: 'en' }),
    ).not.toBe('panels.appearance.title');
    expect(freshI18n.getResourceBundle('en', I18N_NAMESPACES.auth)).toEqual({
      manifest: expect.any(Object),
    });
    expect(
      freshI18n.t('manifest.login.title', { ns: I18N_NAMESPACES.auth, lng: 'en' }),
    ).toBe('Sign in');
    expect(freshI18n.hasResourceBundle('en', I18N_NAMESPACES.dashboard)).toBe(false);
    expect(freshI18n.getResourceBundle('en', I18N_NAMESPACES.onboarding)).toEqual({
      manifest: expect.any(Object),
    });

    await fresh.ensureNamespace('en', I18N_NAMESPACES.auth);
    await fresh.ensureActiveLocale('es');
    expect(freshI18n.hasResourceBundle('es', I18N_NAMESPACES.auth)).toBe(true);
    expect(freshI18n.hasResourceBundle('es', I18N_NAMESPACES.settings)).toBe(true);
    expect(freshI18n.hasResourceBundle('es', I18N_NAMESPACES.dashboard)).toBe(false);
    expect(freshI18n.hasResourceBundle('es', I18N_NAMESPACES.onboarding)).toBe(false);
  });

  it('includes a newly opened surface before committing a delayed locale switch', async () => {
    vi.resetModules();
    const resources = await import('@/lib/i18n/i18n-resources.ts');
    const original = resources.loadLocaleNamespace;
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(resources, 'loadLocaleNamespace').mockImplementation(async (locale, ns) => {
      if (locale === 'fr' && ns === I18N_NAMESPACES.layout) await delayed;
      return original(locale, ns);
    });
    const fresh = await import('@/lib/i18n/load-namespace.ts');
    const { default: instance } = await import('@/lib/i18n/i18n.ts');
    const commit = vi.fn(async () => {
      expect(instance.hasResourceBundle('fr', I18N_NAMESPACES.onboarding)).toBe(true);
      await instance.changeLanguage('fr');
    });
    const switching = fresh.ensureActiveLocale('fr', commit);
    await fresh.ensureNamespace('en', I18N_NAMESPACES.onboarding);
    expect(commit).not.toHaveBeenCalled();
    release();
    await switching;
    expect(commit).toHaveBeenCalledOnce();
    expect(instance.language).toBe('fr');
  });

  it('keeps destination readiness registered until the language commit completes', async () => {
    vi.resetModules();
    const fresh = await import('@/lib/i18n/load-namespace.ts');
    const { default: instance } = await import('@/lib/i18n/i18n.ts');
    let release!: () => void;
    let started!: () => void;
    const committing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const switching = fresh.ensureActiveLocale('de', async () => {
      started();
      await delayed;
    });
    await committing;
    await fresh.ensureNamespace('en', I18N_NAMESPACES.dashboard);
    expect(instance.hasResourceBundle('de', I18N_NAMESPACES.dashboard)).toBe(true);
    release();
    await switching;
  });

  it('clears a failed transition and allows a later retry', async () => {
    vi.resetModules();
    const resources = await import('@/lib/i18n/i18n-resources.ts');
    const loader = vi
      .spyOn(resources, 'loadLocaleNamespace')
      .mockRejectedValueOnce(new Error('Offline'));
    const fresh = await import('@/lib/i18n/load-namespace.ts');
    const commit = vi.fn(async () => {});
    await expect(fresh.ensureActiveLocale('es', commit)).rejects.toThrow('Offline');
    expect(commit).not.toHaveBeenCalled();
    loader.mockRestore();
    await fresh.ensureActiveLocale('es', commit);
    expect(commit).toHaveBeenCalledOnce();
  });

  it('releases navigation when recovery cancels a stalled destination', async () => {
    vi.resetModules();
    const resources = await import('@/lib/i18n/i18n-resources.ts');
    const original = resources.loadLocaleNamespace;
    let reached!: () => void;
    const awaitingDestination = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const loader = vi
      .spyOn(resources, 'loadLocaleNamespace')
      .mockImplementation(async (locale, ns) => {
        if (locale === 'fr') {
          if (ns === I18N_NAMESPACES.auth) reached();
          await delayed;
        }
        return original(locale, ns);
      });
    const fresh = await import('@/lib/i18n/load-namespace.ts');
    const commit = vi.fn(async () => {});
    const switching = fresh.ensureActiveLocale('fr', commit);
    const navigation = fresh.ensureNamespace('en', I18N_NAMESPACES.auth);
    await awaitingDestination;
    fresh.cancelLocaleTransition();
    await Promise.all([switching, navigation]);
    expect(commit).not.toHaveBeenCalled();
    release();
    await settleLoads(loader);
  });
  it('releases destination waiters when another namespace fails the transition', async () => {
    vi.resetModules();
    const resources = await import('@/lib/i18n/i18n-resources.ts');
    const original = resources.loadLocaleNamespace;
    let failLayout!: (error: Error) => void;
    let releaseDashboard!: () => void;
    let reachedDashboard!: () => void;
    const layout = new Promise<void>((_resolve, reject) => {
      failLayout = reject;
    });
    const dashboard = new Promise<void>((resolve) => {
      releaseDashboard = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      reachedDashboard = resolve;
    });
    const loader = vi
      .spyOn(resources, 'loadLocaleNamespace')
      .mockImplementation(async (locale, ns) => {
        if (locale === 'es' && ns === I18N_NAMESPACES.layout) await layout;
        if (locale === 'es' && ns === I18N_NAMESPACES.dashboard) {
          reachedDashboard();
          await dashboard;
        }
        return original(locale, ns);
      });
    const fresh = await import('@/lib/i18n/load-namespace.ts');
    const { default: instance } = await import('@/lib/i18n/i18n.ts');
    const switching = fresh.ensureActiveLocale('es', async () => {
      await instance.changeLanguage('es');
    });
    const failure = expect(switching).rejects.toThrow('layout failed');
    let navigationSettled = false;
    const navigation = fresh.ensureNamespace('en', I18N_NAMESPACES.dashboard).then(() => {
      navigationSettled = true;
    });
    try {
      await reached;
      failLayout(new Error('layout failed'));
      await failure;
      await vi.waitFor(() => expect(navigationSettled).toBe(true), { timeout: 200 });
      expect(instance.language).toBe('en');
      expect(instance.hasResourceBundle('en', I18N_NAMESPACES.dashboard)).toBe(true);
    } finally {
      releaseDashboard();
      await Promise.allSettled([switching, navigation]);
      await settleLoads(loader);
    }
  });

  it('rechecks committed locale when original copy finishes after languageChanged', async () => {
    vi.resetModules();
    const resources = await import('@/lib/i18n/i18n-resources.ts');
    const original = resources.loadLocaleNamespace;
    let release!: () => void;
    const englishAuth = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(resources, 'loadLocaleNamespace').mockImplementation(async (locale, ns) => {
      if (locale === 'en' && ns === I18N_NAMESPACES.auth) await englishAuth;
      return original(locale, ns);
    });
    const fresh = await import('@/lib/i18n/load-namespace.ts');
    const { default: instance } = await import('@/lib/i18n/i18n.ts');
    let navigation: Promise<void> | undefined;
    const onLanguageChanged = () => {
      navigation = fresh.ensureNamespace('en', I18N_NAMESPACES.auth);
    };
    instance.on('languageChanged', onLanguageChanged);
    try {
      await fresh.ensureActiveLocale('es', async () => {
        await instance.changeLanguage('es-MX');
      });
      expect(navigation).toBeDefined();
      expect(instance.language).toBe('es-MX');
      release();
      await navigation;
      expect(instance.hasResourceBundle('es', I18N_NAMESPACES.auth)).toBe(true);
      expect(
        instance.t('organizationPicker.heading', { ns: I18N_NAMESPACES.auth }),
      ).not.toBe('Select organization');
    } finally {
      instance.off('languageChanged', onLanguageChanged);
      release();
      await navigation;
    }
  });

  it('keeps destination waiters pending after a successful async commit', async () => {
    vi.resetModules();
    const resources = await import('@/lib/i18n/i18n-resources.ts');
    const original = resources.loadLocaleNamespace;
    let releaseAuth!: () => void;
    let reachedAuth!: () => void;
    let releaseCommit!: () => void;
    let startedCommit!: () => void;
    const auth = new Promise<void>((resolve) => {
      releaseAuth = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      reachedAuth = resolve;
    });
    const commit = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const started = new Promise<void>((resolve) => {
      startedCommit = resolve;
    });
    vi.spyOn(resources, 'loadLocaleNamespace').mockImplementation(async (locale, ns) => {
      if (locale === 'de' && ns === I18N_NAMESPACES.auth) {
        reachedAuth();
        await auth;
      }
      return original(locale, ns);
    });
    const fresh = await import('@/lib/i18n/load-namespace.ts');
    const { default: instance } = await import('@/lib/i18n/i18n.ts');
    const switching = fresh.ensureActiveLocale('de', async () => {
      startedCommit();
      await commit;
    });
    await started;
    let settled = false;
    const navigation = fresh.ensureNamespace('en', I18N_NAMESPACES.auth).then(() => {
      settled = true;
    });
    try {
      await reached;
      releaseCommit();
      await switching;
      expect(settled).toBe(false);
      releaseAuth();
      await navigation;
      expect(instance.hasResourceBundle('de', I18N_NAMESPACES.auth)).toBe(true);
    } finally {
      releaseCommit();
      releaseAuth();
      await Promise.allSettled([switching, navigation]);
    }
  });
});
