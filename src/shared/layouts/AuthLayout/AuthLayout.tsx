import { lazy, type ReactNode, Suspense } from 'react';

import { LayoutVariantFallback } from '@/shared/layouts/LayoutVariantFallback/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

/** Shared thenables so test preloads and React.lazy hit the same module promise. */
const splitImport = import('./variants/AuthLayoutSplit.tsx');
const spotlightImport = import('./variants/AuthLayoutSpotlight.tsx');
const minimalImport = import('./variants/AuthLayoutMinimal.tsx');

const SplitAuth = lazy(() => splitImport.then((m) => ({ default: m.SplitAuth })));
const SpotlightAuth = lazy(() =>
  spotlightImport.then((m) => ({ default: m.SpotlightAuth })),
);
const MinimalAuth = lazy(() => minimalImport.then((m) => ({ default: m.MinimalAuth })));

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
