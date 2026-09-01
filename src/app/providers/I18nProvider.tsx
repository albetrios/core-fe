import { type ReactNode, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '@/lib/i18n/index.ts';
import { FullPageSpinner } from '@/shared/components/FullPageSpinner/index.ts';
import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

interface I18nProviderProps {
  children: ReactNode;
}

/**
 * How long to wait for the locale store to rehydrate before rendering anyway.
 *
 * Persist hydration is synchronous against `localStorage` today, so this never
 * fires in practice — which is exactly why it has to exist. The moment that
 * storage becomes async (an IndexedDB adapter, a remote profile, a browser that
 * blocks storage access), `hasHydrated` never flips, this provider returns
 * nothing forever, and `main.tsx` dismisses the boot splash after first paint
 * regardless: a white screen with no spinner and no error, and nothing in the
 * app that would ever recover from it (X-8). A deadline turns that into "we fell
 * back to the default locale", which is a bad minute rather than a dead tab.
 */
const HYDRATION_TIMEOUT_MS = 1500;

/**
 * Client-side i18n — wraps react-i18next.
 * Document `lang`/`dir` are applied by `locale-init.js` (pre-paint) and
 * `useLocaleStore` persist `onRehydrateStorage` (post-hydrate) — not here —
 * so we never double-`ensureLocale` on boot. We still wait for persist hydrate
 * so the first React paint reads the restored locale profile.
 *
 * The provider itself mounts immediately either way: the i18n instance does not
 * depend on the store, so the loading fallback below can still translate, and a
 * child that renders during the wait is never handed a missing context.
 */
export function I18nProvider({ children }: I18nProviderProps) {
  const [ready, setReady] = useState(() => useLocaleStore.persist.hasHydrated());

  useEffect(() => {
    if (ready) return;
    const stopListening = useLocaleStore.persist.onFinishHydration(() => {
      setReady(true);
    });
    const deadline = window.setTimeout(() => setReady(true), HYDRATION_TIMEOUT_MS);
    return () => {
      stopListening();
      window.clearTimeout(deadline);
    };
  }, [ready]);

  return (
    <I18nextProvider i18n={i18n}>
      {/* Never `null`: the boot splash is dismissed after first paint, so an
          empty render here is a white screen the user cannot leave. The spinner
          keeps itself hidden while the splash is still up, so the two never
          stack. */}
      {ready ? children : <FullPageSpinner />}
    </I18nextProvider>
  );
}
