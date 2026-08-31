import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isAppSplashActive, onAppSplashDismissed } from '@/lib/app-splash.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { BrandLoader } from '@/shared/components/BrandLoader/index.ts';

/**
 * Full-page branded loader used during app bootstrap and auth checks. While the
 * HTML `#app-splash` overlay is still visible, this returns null so two loaders
 * never stack/blink; after the splash eases out, this takes over for Suspense
 * boundaries.
 *
 * This is `fixed inset-0` with an opaque background — it OWNS the viewport. Never
 * render it as a sibling of content the user still needs: it paints over its own
 * neighbours, which is how the auth screen's "use email instead" button ended up
 * on screen but unclickable (LOGIN-1). For a loader that shares a surface, use
 * {@link BrandLoader}, the same visual without the overlay.
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
      className="bg-background fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
    >
      <BrandLoader />
      <span className="sr-only">Loading…</span>
    </output>
  );
}
