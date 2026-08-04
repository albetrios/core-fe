import { lazy, Suspense } from 'react';

import { onceAsync } from '@/lib/lazy-module.ts';
import { LayoutVariantFallback } from '@/shared/layouts/LayoutVariantFallback/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

// Each variant is fetched on first render (or preload) and shared from then on.
// A module-scope `import()` would instead fetch all three the moment this
// module evaluates, which defeats the split.
const loadCentered = onceAsync(() => import('./variants/PublicLayoutCentered.tsx'));
const loadCard = onceAsync(() => import('./variants/PublicLayoutCard.tsx'));
const loadBrand = onceAsync(() => import('./variants/PublicLayoutBrand.tsx'));

const CenteredPublic = lazy(() =>
  loadCentered().then((m) => ({ default: m.CenteredPublic })),
);
const CardPublic = lazy(() => loadCard().then((m) => ({ default: m.CardPublic })));
const BrandPublic = lazy(() => loadBrand().then((m) => ({ default: m.BrandPublic })));

const PUBLIC_SHELLS = [CenteredPublic, CardPublic, BrandPublic] as const;

/**
 * Minimal centered chrome for public, non-app routes — `/callback`, `/unauthorized`,
 * `/onboarding`, `/accept-invite/$id`, and the 404. Three TEMP preview shells
 * (centered, card, brand) lazy-load via `publicVariant` (Shuffle cycles).
 */
export function PublicLayout() {
  const variant = useThemeStore((s) => s.publicVariant);
  const Shell = PUBLIC_SHELLS[variant] ?? CenteredPublic;

  return (
    <Suspense fallback={<LayoutVariantFallback />}>
      <Shell />
    </Suspense>
  );
}

/** Warms every variant chunk so tests can render any shell without a Suspense race. */
// eslint-disable-next-line react-refresh/only-export-components -- test-facing preload hook
export const preloadPublicLayoutVariants = () =>
  Promise.all([loadCentered(), loadCard(), loadBrand()]);
