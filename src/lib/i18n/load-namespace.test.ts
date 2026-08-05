import { afterEach, describe, expect, it, vi } from 'vitest';

import * as buildEnv from '@/lib/i18n/build-env.ts';
import * as buildRuntime from '@/lib/i18n/build-runtime.ts';
import i18n from '@/lib/i18n/i18n.ts';
import {
  ensureLocale,
  ensureNamespace,
  loadNamespaceModule,
  preloadLocaleIdle,
} from '@/lib/i18n/load-namespace.ts';
import { I18N_LOCALES } from '@/lib/i18n/locales.ts';
import { I18N_NAMESPACES } from '@/lib/i18n/namespaces.ts';

const ALL_NAMESPACES = Object.values(I18N_NAMESPACES);

describe('load-namespace', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
