import { lazy, Suspense } from 'react';

import { onceAsync } from '@/lib/lazy-module.ts';
import { WorkspaceSwitchOverlay } from '@/shared/components/WorkspaceSwitchOverlay/index.ts';
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
      {/*
        The workspace-switch cover, mounted HERE as well as in `AppLayout`.
        Finishing onboarding activates a workspace and then hands the user over
        to it, and that whole hop happens on THIS layout — so a cover that only
        the app shell mounts could not appear until the destination had already
        arrived, which is the one moment it has nothing left to say.

        Mounted in the two layouts rather than once at the route root on
        purpose: the root component is entry-resident, and putting it there cost
        the initial JS bundle ~15 kB gzipped against a budget with under half a
        kilobyte of headroom. Both layouts are lazy route components, so here it
        costs nothing before it can possibly be needed. It renders `null` unless
        a switch is in flight, so the two mounts never collide.
      */}
      <WorkspaceSwitchOverlay />
      <Shell />
    </Suspense>
  );
}

/** Warms every variant chunk so tests can render any shell without a Suspense race. */
const preloadPublicLayoutVariants = () =>
  Promise.all([loadCentered(), loadCard(), loadBrand()]);

/* eslint-disable react-refresh/only-export-components -- test-facing preload hook */
export { preloadPublicLayoutVariants };
/* eslint-enable react-refresh/only-export-components */
