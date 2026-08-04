import { lazy, type ReactNode, Suspense } from 'react';

import { LayoutVariantFallback } from '@/shared/layouts/LayoutVariantFallback/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

const SplitAuth = lazy(() =>
  import('./variants/AuthLayoutSplit.tsx').then((m) => ({ default: m.SplitAuth })),
);
const SpotlightAuth = lazy(() =>
  import('./variants/AuthLayoutSpotlight.tsx').then((m) => ({
    default: m.SpotlightAuth,
  })),
);
const MinimalAuth = lazy(() =>
  import('./variants/AuthLayoutMinimal.tsx').then((m) => ({ default: m.MinimalAuth })),
);

interface AuthLayoutProps {
  children: ReactNode;
}

const AUTH_SHELLS = [SplitAuth, SpotlightAuth, MinimalAuth] as const;

function AuthLayoutShell({
  variant,
  children,
}: {
  variant: number;
  children: ReactNode;
}) {
  const Shell = AUTH_SHELLS[variant] ?? SplitAuth;
  return (
    <Suspense fallback={<LayoutVariantFallback />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

/**
 * Auth layout shell for the sign-in / sign-up surfaces.
 *
 * Variant 0 (default) is the split brand panel + form. Variants 1 (spotlight)
 * and 2 (minimal) are TEMP design previews selected by `authVariant`, which
 * Shuffle cycles — each variant is lazy-loaded so only the active shell ships
 * in the initial chunk. Remove the variants + the `authVariant` store field
 * once a design is chosen.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  const variant = useThemeStore((s) => s.authVariant);
  return <AuthLayoutShell variant={variant}>{children}</AuthLayoutShell>;
}
