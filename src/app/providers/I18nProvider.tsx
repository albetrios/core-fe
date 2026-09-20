import { type ReactNode, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '@/lib/i18n/index.ts';
import { FullPageSpinner } from '@/shared/components/FullPageSpinner/index.ts';
import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

interface I18nProviderProps {
  children: ReactNode;
}

const INITIAL_LOCALE_TIMEOUT_MS = 1500;

/**
 * The store owns hydration and translation readiness. Only startup is gated;
 * interactive language changes leave the existing UI mounted and usable.
 */
export function I18nProvider({ children }: I18nProviderProps) {
  const ready = useLocaleStore((state) => state.isLocaleReady);
  const recoverInitialLocale = useLocaleStore((state) => state.recoverInitialLocale);

  useEffect(() => {
    if (ready) return;
    const deadline = window.setTimeout(() => {
      void recoverInitialLocale();
    }, INITIAL_LOCALE_TIMEOUT_MS);
    return () => window.clearTimeout(deadline);
  }, [ready, recoverInitialLocale]);

  return (
    <I18nextProvider i18n={i18n}>
      {ready ? children : <FullPageSpinner />}
    </I18nextProvider>
  );
}
