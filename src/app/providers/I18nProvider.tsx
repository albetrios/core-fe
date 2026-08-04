import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';

import { applyDocumentLocale } from '@/lib/i18n/apply-document-locale.ts';
import { i18n } from '@/lib/i18n/index.ts';
import { useLocaleStore } from '@/shared/store/useLocaleStore/index.ts';

interface I18nProviderProps {
  children: ReactNode;
}

/** Client-side i18n — wraps react-i18next; init runs on `@/lib/i18n/i18n.ts` import. */
export function I18nProvider({ children }: I18nProviderProps) {
  useEffect(() => {
    const { locale, textDirection } = useLocaleStore.getState();
    void applyDocumentLocale(locale, textDirection);
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
