import { lazy, type ReactNode, Suspense } from 'react';

import {
  loadMinimalAuth,
  loadSplitAuth,
  loadSpotlightAuth,
  preloadAllAuthLayoutVariants,
} from '@/shared/layouts/AuthLayout/auth-layout-variants.ts';
import { LayoutVariantFallback } from '@/shared/layouts/LayoutVariantFallback/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

// The loaders live in `auth-layout-variants.ts` so the route tree can warm the
// active variant without importing this layout into the entry chunk.
const SplitAuth = lazy(() => loadSplitAuth().then((m) => ({ default: m.SplitAuth })));
const SpotlightAuth = lazy(() =>
  loadSpotlightAuth().then((m) => ({ default: m.SpotlightAuth })),
);
const MinimalAuth = lazy(() =>
  loadMinimalAuth().then((m) => ({ default: m.MinimalAuth })),
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
 * Variant index comes from the Appearance shuffle (`authVariant`).
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  const authVariant = useThemeStore((s) => s.authVariant);
  return <AuthLayoutShell variant={authVariant}>{children}</AuthLayoutShell>;
}

/* eslint-disable react-refresh/only-export-components -- test-facing preload hook */
export { preloadAllAuthLayoutVariants as preloadAuthLayoutVariants };
/* eslint-enable react-refresh/only-export-components */
