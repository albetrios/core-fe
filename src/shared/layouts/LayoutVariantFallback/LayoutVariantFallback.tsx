import { useTranslation } from 'react-i18next';

import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';

/**
 * Suspense fallback while a layout variant chunk loads.
 *
 * Shell-shaped and full-bleed on purpose. The old `min-h-24` strip occupied a
 * sliver of an otherwise blank page, so a shell swap read as "the app broke"
 * rather than "the app is loading" (SHELL-1). `AppLayout` now preloads the
 * target chunk before committing a swap, so this should only ever be seen on a
 * genuine first mount — and when it is, it holds the frame's shape.
 */
export function LayoutVariantFallback() {
  const { t } = useTranslation(LOCALE_NS);
  return (
    <div
      data-testid="layout-variant-fallback"
      className="bg-background flex min-h-0 flex-1"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">{t(LOCALE_KEYS.loading)}</span>
      {/* Nav rail placeholder — hidden on mobile, where no shell shows one. */}
      <div
        className="bg-sidebar/40 hidden w-[17.5rem] shrink-0 animate-pulse border-e md:block"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className="bg-muted/40 h-14 shrink-0 animate-pulse border-b"
          aria-hidden="true"
        />
        <div className="flex-1 space-y-4 p-4 sm:p-6" aria-hidden="true">
          <div className="bg-muted/40 h-8 w-1/3 animate-pulse rounded" />
          <div className="bg-muted/30 h-40 animate-pulse rounded" />
          <div className="bg-muted/30 h-40 animate-pulse rounded" />
        </div>
      </div>
    </div>
  );
}
