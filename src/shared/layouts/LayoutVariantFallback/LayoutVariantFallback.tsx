import { useTranslation } from 'react-i18next';

import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';

/** Lightweight suspense fallback while a layout variant chunk loads. */
export function LayoutVariantFallback() {
  const { t } = useTranslation(LOCALE_NS);
  return (
    <div
      data-testid="layout-variant-fallback"
      className="bg-background text-muted-foreground flex min-h-24 items-center justify-center text-sm"
      aria-busy="true"
    >
      {t(LOCALE_KEYS.loading)}
    </div>
  );
}
