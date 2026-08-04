import type { ReactNode } from 'react';

import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

import { MinimalAuth } from './variants/AuthLayoutMinimal.tsx';
import { SplitAuth } from './variants/AuthLayoutSplit.tsx';
import { SpotlightAuth } from './variants/AuthLayoutSpotlight.tsx';

interface AuthLayoutProps {
  children: ReactNode;
}

/** Eager shells — lazy+Suspense flaked under the full Vitest suite (stuck fallback). */
const AUTH_SHELLS = [SplitAuth, SpotlightAuth, MinimalAuth] as const;

function AuthLayoutShell({
  variant,
  children,
}: {
  variant: number;
  children: ReactNode;
}) {
  const Shell = AUTH_SHELLS[variant] ?? SplitAuth;
  return <Shell>{children}</Shell>;
}

/**
 * Auth layout shell for the sign-in / sign-up surfaces.
 *
 * Variant 0 (default) is the split brand panel + form. Variants 1 (spotlight)
 * and 2 (minimal) are TEMP design previews selected by `authVariant`, which
 * Shuffle cycles. Remove the variants + the `authVariant` store field once a
 * design is chosen.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  const variant = useThemeStore((s) => s.authVariant);
  return <AuthLayoutShell variant={variant}>{children}</AuthLayoutShell>;
}
