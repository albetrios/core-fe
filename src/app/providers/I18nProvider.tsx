import { type ReactNode, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '@/lib/i18n/index.ts';
import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

interface I18nProviderProps {
  children: ReactNode;
}

/**
 * Client-side i18n — wraps react-i18next.
 * Document `lang`/`dir` are applied by `locale-init.js` (pre-paint) and
 * `useLocaleStore` persist `onRehydrateStorage` (post-hydrate) — not here —
 * so we never double-`ensureLocale` on boot. We still wait for persist hydrate
 * so the first React paint reads the restored locale profile.
 */
export function I18nProvider({ children }: I18nProviderProps) {
  const [ready, setReady] = useState(() => useLocaleStore.persist.hasHydrated());

  useEffect(() => {
    if (ready) return;
    return useLocaleStore.persist.onFinishHydration(() => {
      setReady(true);
    });
  }, [ready]);

  if (!ready) return null;

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
