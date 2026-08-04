import { lazy, type ReactNode, Suspense } from 'react';

import { onceAsync } from '@/lib/lazy-module.ts';
import { LayoutVariantFallback } from '@/shared/layouts/LayoutVariantFallback/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

// Each variant is fetched on first render (or preload) and shared from then on.
// A module-scope `import()` would instead fetch all three the moment this
// module evaluates, which defeats the split.
const loadSplit = onceAsync(() => import('./variants/AuthLayoutSplit.tsx'));
const loadSpotlight = onceAsync(() => import('./variants/AuthLayoutSpotlight.tsx'));
const loadMinimal = onceAsync(() => import('./variants/AuthLayoutMinimal.tsx'));

const SplitAuth = lazy(() => loadSplit().then((m) => ({ default: m.SplitAuth })));
const SpotlightAuth = lazy(() =>
  loadSpotlight().then((m) => ({ default: m.SpotlightAuth })),
);
const MinimalAuth = lazy(() => loadMinimal().then((m) => ({ default: m.MinimalAuth })));

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

/** Warms every variant chunk so tests can render any shell without a Suspense race. */
// eslint-disable-next-line react-refresh/only-export-components -- test-facing preload hook
export const preloadAuthLayoutVariants = () =>
  Promise.all([loadSplit(), loadSpotlight(), loadMinimal()]);
