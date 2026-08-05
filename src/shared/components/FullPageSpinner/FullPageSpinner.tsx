import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isAppSplashActive, onAppSplashDismissed } from '@/lib/app-splash.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { iconChipClassName, iconOnPrimarySurface } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import { Boxes } from '@/shared/icons/index.ts';

/**
 * Full-page branded loader used during app bootstrap and auth checks. A
 * "breathing" brand tile + wordmark + indeterminate bar — NOT a rotating
 * spinner. While the HTML `#app-splash` overlay is still visible, this returns
 * null so two loaders never stack/blink; after the splash eases out, this
 * takes over for Suspense boundaries. Reduced-motion is honoured globally.
 */
export function FullPageSpinner() {
  const { t } = useTranslation(LOCALE_NS);
  const [splashHidden, setSplashHidden] = useState(() => !isAppSplashActive());

  useEffect(() => {
    if (splashHidden) return;
    return onAppSplashDismissed(() => setSplashHidden(true));
  }, [splashHidden]);

  if (!splashHidden) return null;

  return (
    <output
      aria-label={t(LOCALE_KEYS.loading)}
      data-testid="full-page-spinner"
      className="bg-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-hidden"
    >
      <div className="flex flex-col items-center gap-4">
        <span
          data-slot="icon-chip"
          className={cn(
            'bg-primary text-primary-foreground animate-boot-breathe size-12',
            iconChipClassName,
          )}
          aria-hidden="true"
        >
          <Boxes className={cn('size-6', iconOnPrimarySurface)} />
        </span>
        <span className="text-foreground text-base font-semibold tracking-tight">
          Core
        </span>
      </div>
      <span
        className="bg-muted block h-1 w-32 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        <span className="bg-primary animate-boot-progress block h-full w-1/2 rounded-full" />
      </span>
      <span className="sr-only">Loading…</span>
    </output>
  );
}
