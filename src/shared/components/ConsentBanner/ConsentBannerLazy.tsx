import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { onceAsync } from '@/lib/lazy-module.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { useConsentStore } from '@/shared/store/useConsentStore/index.ts';

const loadConsentBanner = onceAsync(() => import('./ConsentBanner.tsx'));

const ConsentBannerCard = lazy(() =>
  loadConsentBanner().then((m) => ({ default: m.ConsentBanner })),
);

/**
 * The cookie-consent card, off the first-paint path.
 *
 * It is mounted on the ROOT route, so a static import put the whole card in the
 * entry chunk of every load — for a surface that a returning visitor (decision
 * already stored) never sees at all, and that a new one does not need until the
 * page they came for is up. Undecided visitors fetch it on demand; it slides in
 * a beat after the content, which is how it was designed to arrive anyway.
 *
 * Failure is silent on purpose. No card means no decision, and no decision means
 * analytics stays OFF (`hasAnalyticsConsent()` is false until `granted`) — the
 * privacy-safe outcome — while an error card in a fixed corner would have
 * nowhere sensible to sit. The throw is still reported by the boundary.
 */
export function ConsentBannerLazy() {
  const { t } = useTranslation(LOCALE_NS);
  const undecided = useConsentStore((s) => s.analyticsConsent === null);

  if (!undecided) return null;

  return (
    <SectionErrorBoundary title={t(LOCALE_KEYS.cookieConsent)} variant="silent">
      <Suspense fallback={null}>
        <ConsentBannerCard />
      </Suspense>
    </SectionErrorBoundary>
  );
}
