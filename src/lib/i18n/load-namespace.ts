import { uiLocaleFromBcp47 } from '@/lib/i18n/build-config.ts';
import { readInjectedTestMode } from '@/lib/i18n/build-env.ts';
import { isMultiLocaleBuild } from '@/lib/i18n/build-runtime.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { I18N_BUILD_UI_LOCALE, loadLocaleNamespace } from '@/lib/i18n/i18n-resources.ts';
import type { I18nLocale } from '@/lib/i18n/locales.ts';
import { I18N_NAMESPACES, type I18nNamespace } from '@/lib/i18n/namespaces.ts';

const ALL_NAMESPACES = Object.values(I18N_NAMESPACES);

const loadedBundles = new Set<string>();
const pendingBundles = new Map<string, Promise<void>>();
let localeTransition:
  | {
      locale: I18nLocale;
      cancelled: Promise<void>;
      cancel: () => void;
    }
  | undefined;
const activeNamespaces = new Set<I18nNamespace>([
  I18N_NAMESPACES.common,
  I18N_NAMESPACES.errors,
  I18N_NAMESPACES.layout,
]);

function bundleKey(locale: I18nLocale, ns: I18nNamespace): string {
  return `${locale}:${ns}`;
}

function isBundleLoaded(locale: I18nLocale, ns: I18nNamespace): boolean {
  if (!i18n.hasResourceBundle(locale, ns)) return false;
  // Shell labels and route titles do not mean their full namespace is ready.
  if (
    locale === I18N_BUILD_UI_LOCALE &&
    (ns === I18N_NAMESPACES.settings ||
      ns === I18N_NAMESPACES.auth ||
      ns === I18N_NAMESPACES.onboarding)
  ) {
    return loadedBundles.has(bundleKey(locale, ns));
  }
  return true;
}

async function ensureBundle(
  requestedLocale: I18nLocale,
  ns: I18nNamespace,
): Promise<void> {
  const locale = isMultiLocaleBuild() ? requestedLocale : I18N_BUILD_UI_LOCALE;

  if (isBundleLoaded(locale, ns)) {
    loadedBundles.add(bundleKey(locale, ns));
    return;
  }

  const key = bundleKey(locale, ns);
  let pending = pendingBundles.get(key);
  if (!pending) {
    pending = loadLocaleNamespace(locale, ns)
      .then((bundle) => {
        i18n.addResourceBundle(locale, ns, bundle, true, true);
        loadedBundles.add(key);
      })
      .finally(() => {
        pendingBundles.delete(key);
      });
    pendingBundles.set(key, pending);
  }
  await pending;
}

/** Load a surface's copy, including any language currently being applied. */
export async function ensureNamespace(
  locale: I18nLocale,
  ns: I18nNamespace,
): Promise<void> {
  activeNamespaces.add(ns);
  await ensureBundle(locale, ns);
  while (true) {
    const transition = localeTransition;
    if (!transition) {
      const committedLocale = uiLocaleFromBcp47(i18n.language ?? I18N_BUILD_UI_LOCALE);
      await ensureBundle(committedLocale, ns);
      if (
        !localeTransition &&
        committedLocale === uiLocaleFromBcp47(i18n.language ?? I18N_BUILD_UI_LOCALE)
      )
        return;
      continue;
    }
    try {
      await Promise.race([ensureBundle(transition.locale, ns), transition.cancelled]);
    } catch (error) {
      if (transition === localeTransition) throw error;
    }
    if (transition === localeTransition) break;
  }
}

/**
 * Invoke a locale JSON loader directly (bypasses bootstrap cache).
 * Kept for tests so every explicit import path stays covered.
 */
export async function loadNamespaceModule(
  locale: I18nLocale,
  ns: I18nNamespace,
): Promise<Record<string, unknown>> {
  return loadLocaleNamespace(locale, ns);
}

/** Load every registered namespace for a locale (parallel). */
export async function ensureLocale(locale: I18nLocale): Promise<void> {
  await Promise.all(ALL_NAMESPACES.map((ns) => ensureNamespace(locale, ns)));
}

/** Release surface waiters when a newer language choice or startup recovery wins. */
export function cancelLocaleTransition(): void {
  localeTransition?.cancel();
  localeTransition = undefined;
}

/** Change language only after the current surfaces and shell copy are ready. */
export async function ensureActiveLocale(
  locale: I18nLocale,
  onReady?: () => Promise<void>,
): Promise<void> {
  let cancel!: () => void;
  const cancelled = new Promise<void>((resolve) => {
    cancel = resolve;
  });
  const transition = { locale, cancelled, cancel };
  if (onReady) {
    cancelLocaleTransition();
    localeTransition = transition;
  }
  try {
    let count: number;
    do {
      count = activeNamespaces.size;
      const namespaces = new Set(activeNamespaces);
      if (locale !== I18N_BUILD_UI_LOCALE) namespaces.add(I18N_NAMESPACES.settings);
      const ready = Promise.all([...namespaces].map((ns) => ensureBundle(locale, ns)));
      await (onReady ? Promise.race([ready, cancelled]) : ready);
      if (onReady && localeTransition !== transition) return;
    } while (count !== activeNamespaces.size);
    await onReady?.();
  } catch (error) {
    transition.cancel();
    throw error;
  } finally {
    if (localeTransition === transition) localeTransition = undefined;
  }
}

/** Warm non-active locales during idle time (keeps initial bundle small). */
export function preloadLocaleIdle(locale: I18nLocale): void {
  if (!isMultiLocaleBuild()) return;
  // Idle preloads compete with Vitest's transform queue under the full suite.
  if (readInjectedTestMode()) return;
  if (locale === I18N_BUILD_UI_LOCALE) return;

  if (typeof window === 'undefined') return;
  const run = () => {
    // Speculative warming must not create an unhandled rejection while offline.
    void ensureActiveLocale(locale).catch(() => undefined);
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
