import { isMultiLocaleBuild } from '@/lib/i18n/build-runtime.ts';
import i18n from '@/lib/i18n/i18n.ts';
import {
  getBootstrapResources,
  I18N_BUILD_UI_LOCALE,
} from '@/lib/i18n/i18n-resources.ts';
import type { I18nLocale } from '@/lib/i18n/locales.ts';
import { I18N_NAMESPACES, type I18nNamespace } from '@/lib/i18n/namespaces.ts';

type NamespaceModule = { default: Record<string, unknown> };
type NamespaceLoaders = Record<I18nNamespace, () => Promise<NamespaceModule>>;

/**
 * Explicit per-locale loaders (not `import(\`…${locale}…\`)`).
 * Template globs can overwhelm Vitest's transform queue under the full suite
 * and starve unrelated lazy chunks (e.g. AppLayout sidebar Suspense).
 */
const NAMESPACE_LOADERS: Record<I18nLocale, NamespaceLoaders> = {
  en: {
    common: () => import('@/locales/en/common.json'),
    layout: () => import('@/locales/en/layout.json'),
    dashboard: () => import('@/locales/en/dashboard.json'),
    settings: () => import('@/locales/en/settings.json'),
    errors: () => import('@/locales/en/errors.json'),
    auth: () => import('@/locales/en/auth.json'),
    onboarding: () => import('@/locales/en/onboarding.json'),
  },
  es: {
    common: () => import('@/locales/es/common.json'),
    layout: () => import('@/locales/es/layout.json'),
    dashboard: () => import('@/locales/es/dashboard.json'),
    settings: () => import('@/locales/es/settings.json'),
    errors: () => import('@/locales/es/errors.json'),
    auth: () => import('@/locales/es/auth.json'),
    onboarding: () => import('@/locales/es/onboarding.json'),
  },
  zh: {
    common: () => import('@/locales/zh/common.json'),
    layout: () => import('@/locales/zh/layout.json'),
    dashboard: () => import('@/locales/zh/dashboard.json'),
    settings: () => import('@/locales/zh/settings.json'),
    errors: () => import('@/locales/zh/errors.json'),
    auth: () => import('@/locales/zh/auth.json'),
    onboarding: () => import('@/locales/zh/onboarding.json'),
  },
  fr: {
    common: () => import('@/locales/fr/common.json'),
    layout: () => import('@/locales/fr/layout.json'),
    dashboard: () => import('@/locales/fr/dashboard.json'),
    settings: () => import('@/locales/fr/settings.json'),
    errors: () => import('@/locales/fr/errors.json'),
    auth: () => import('@/locales/fr/auth.json'),
    onboarding: () => import('@/locales/fr/onboarding.json'),
  },
  de: {
    common: () => import('@/locales/de/common.json'),
    layout: () => import('@/locales/de/layout.json'),
    dashboard: () => import('@/locales/de/dashboard.json'),
    settings: () => import('@/locales/de/settings.json'),
    errors: () => import('@/locales/de/errors.json'),
    auth: () => import('@/locales/de/auth.json'),
    onboarding: () => import('@/locales/de/onboarding.json'),
  },
  ja: {
    common: () => import('@/locales/ja/common.json'),
    layout: () => import('@/locales/ja/layout.json'),
    dashboard: () => import('@/locales/ja/dashboard.json'),
    settings: () => import('@/locales/ja/settings.json'),
    errors: () => import('@/locales/ja/errors.json'),
    auth: () => import('@/locales/ja/auth.json'),
    onboarding: () => import('@/locales/ja/onboarding.json'),
  },
  pt: {
    common: () => import('@/locales/pt/common.json'),
    layout: () => import('@/locales/pt/layout.json'),
    dashboard: () => import('@/locales/pt/dashboard.json'),
    settings: () => import('@/locales/pt/settings.json'),
    errors: () => import('@/locales/pt/errors.json'),
    auth: () => import('@/locales/pt/auth.json'),
    onboarding: () => import('@/locales/pt/onboarding.json'),
  },
  ar: {
    common: () => import('@/locales/ar/common.json'),
    layout: () => import('@/locales/ar/layout.json'),
    dashboard: () => import('@/locales/ar/dashboard.json'),
    settings: () => import('@/locales/ar/settings.json'),
    errors: () => import('@/locales/ar/errors.json'),
    auth: () => import('@/locales/ar/auth.json'),
    onboarding: () => import('@/locales/ar/onboarding.json'),
  },
  hi: {
    common: () => import('@/locales/hi/common.json'),
    layout: () => import('@/locales/hi/layout.json'),
    dashboard: () => import('@/locales/hi/dashboard.json'),
    settings: () => import('@/locales/hi/settings.json'),
    errors: () => import('@/locales/hi/errors.json'),
    auth: () => import('@/locales/hi/auth.json'),
    onboarding: () => import('@/locales/hi/onboarding.json'),
  },
  ko: {
    common: () => import('@/locales/ko/common.json'),
    layout: () => import('@/locales/ko/layout.json'),
    dashboard: () => import('@/locales/ko/dashboard.json'),
    settings: () => import('@/locales/ko/settings.json'),
    errors: () => import('@/locales/ko/errors.json'),
    auth: () => import('@/locales/ko/auth.json'),
    onboarding: () => import('@/locales/ko/onboarding.json'),
  },
  it: {
    common: () => import('@/locales/it/common.json'),
    layout: () => import('@/locales/it/layout.json'),
    dashboard: () => import('@/locales/it/dashboard.json'),
    settings: () => import('@/locales/it/settings.json'),
    errors: () => import('@/locales/it/errors.json'),
    auth: () => import('@/locales/it/auth.json'),
    onboarding: () => import('@/locales/it/onboarding.json'),
  },
};

const ALL_NAMESPACES = Object.values(I18N_NAMESPACES);

const loadedBundles = new Set<string>();

function bundleKey(locale: I18nLocale, ns: I18nNamespace): string {
  return `${locale}:${ns}`;
}

function isBundleLoaded(locale: I18nLocale, ns: I18nNamespace): boolean {
  return loadedBundles.has(bundleKey(locale, ns)) || i18n.hasResourceBundle(locale, ns);
}

function ensureSingleLocaleBundle(locale: I18nLocale, ns: I18nNamespace): void {
  if (isBundleLoaded(locale, ns)) {
    loadedBundles.add(bundleKey(locale, ns));
    return;
  }

  const resources = getBootstrapResources();
  const bundle = resources[locale]?.[ns];
  if (bundle) {
    i18n.addResourceBundle(locale, ns, bundle, true, true);
    loadedBundles.add(bundleKey(locale, ns));
  }
}

/** Load one namespace for a locale (no-op if already present). */
export async function ensureNamespace(
  locale: I18nLocale,
  ns: I18nNamespace,
): Promise<void> {
  if (!isMultiLocaleBuild()) {
    ensureSingleLocaleBundle(locale, ns);
    return;
  }

  if (isBundleLoaded(locale, ns)) {
    loadedBundles.add(bundleKey(locale, ns));
    return;
  }

  const loader = NAMESPACE_LOADERS[locale][ns];
  const mod = await loader();
  i18n.addResourceBundle(locale, ns, mod.default, true, true);
  loadedBundles.add(bundleKey(locale, ns));
}

/** Load every registered namespace for a locale (parallel). */
export async function ensureLocale(locale: I18nLocale): Promise<void> {
  await Promise.all(ALL_NAMESPACES.map((ns) => ensureNamespace(locale, ns)));
}

/** Warm non-active locales during idle time (keeps initial bundle small). */
export function preloadLocaleIdle(locale: I18nLocale): void {
  if (!isMultiLocaleBuild()) return;
  if (locale === I18N_BUILD_UI_LOCALE) return;

  if (typeof window === 'undefined') return;
  const run = () => {
    void ensureLocale(locale);
  };
  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 1500);
  }
}
