import { lazy, Suspense } from 'react';

import { LayoutVariantFallback } from '@/shared/layouts/LayoutVariantFallback/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

/** Shared thenables so test preloads and React.lazy hit the same module promise. */
const centeredImport = import('./variants/PublicLayoutCentered.tsx');
const cardImport = import('./variants/PublicLayoutCard.tsx');
const brandImport = import('./variants/PublicLayoutBrand.tsx');

const CenteredPublic = lazy(() =>
  centeredImport.then((m) => ({ default: m.CenteredPublic })),
);
const CardPublic = lazy(() => cardImport.then((m) => ({ default: m.CardPublic })));
const BrandPublic = lazy(() => brandImport.then((m) => ({ default: m.BrandPublic })));

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
