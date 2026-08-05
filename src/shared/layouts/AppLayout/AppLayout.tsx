import { useParams } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import { onceAsync } from '@/lib/lazy-module.ts';
import { CommandPaletteLazy } from '@/shared/components/CommandPalette/index.ts';
import { KeyboardShortcutsLazy } from '@/shared/components/KeyboardShortcutsDialog/KeyboardShortcutsLazy.tsx';
import { SessionTimeoutDialog } from '@/shared/components/SessionTimeoutDialog/index.ts';
import { useVisibleNav } from '@/shared/hooks/useCan/index.ts';
import { useDeploymentMode } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useOrgBrand } from '@/shared/hooks/useOrgBrand/index.ts';
import { NAV_ITEMS, SkipLink } from '@/shared/layouts/AppLayout/AppLayout.shared.tsx';
import {
  APP_SHELL_VARIANT,
  type AppShellVariant,
  resolveAppShellVariant,
} from '@/shared/layouts/AppLayout/resolve-app-shell.ts';
import { LayoutVariantFallback } from '@/shared/layouts/LayoutVariantFallback/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';

// Each shell is fetched on first render (or preload) and shared from then on.
// A module-scope `import()` would instead fetch all four the moment this
// module evaluates, which defeats the split.
const loadSidebar = onceAsync(() => import('./variants/AppLayoutSidebar.tsx'));
const loadTopNav = onceAsync(() => import('./variants/AppLayoutTopNav.tsx'));
const loadRail = onceAsync(() => import('./variants/AppLayoutRail.tsx'));
const loadFocus = onceAsync(() => import('./variants/AppLayoutFocus.tsx'));

const SidebarShell = lazy(() => loadSidebar().then((m) => ({ default: m.SidebarShell })));
const TopNavShell = lazy(() => loadTopNav().then((m) => ({ default: m.TopNavShell })));
const RailShell = lazy(() => loadRail().then((m) => ({ default: m.RailShell })));
const FocusShell = lazy(() => loadFocus().then((m) => ({ default: m.FocusShell })));

const APP_SHELLS = [SidebarShell, TopNavShell, RailShell, FocusShell] as const;

function AppLayoutShell({
  variant,
  navItems,
  organizationSlug,
}: {
  variant: AppShellVariant;
  navItems: typeof NAV_ITEMS;
  organizationSlug: string;
}) {
  const props = { navItems, organizationSlug };
  const Shell = APP_SHELLS[variant] ?? FocusShell;
  return (
    <Suspense fallback={<LayoutVariantFallback />}>
      <Shell {...props} />
    </Suspense>
  );
}

/**
 * Main authenticated layout. Personal-only deployments use the Focus shell
 * (full-width canvas, context strip, ⌘K-first). Variants 0–2 remain shuffle
 * previews for multi-org modes. Exports `Component` for lazy() resolution.
 */
export function Component() {
  useOrgBrand();
  const navItems = useVisibleNav(NAV_ITEMS);
  const { organizationSlug = '' } = useParams({ strict: false });
  const themeVariant = useThemeStore((s) => s.appVariant);
  const deploymentMode = useDeploymentMode();
  const variant = resolveAppShellVariant(deploymentMode, themeVariant);

  return (
    <div className="bg-background flex h-screen overflow-hidden" data-testid="app-layout">
      <SkipLink />
      <AppLayoutShell
        variant={variant}
        navItems={navItems}
        organizationSlug={organizationSlug}
      />
      <CommandPaletteLazy />
      <KeyboardShortcutsLazy />
      <SessionTimeoutDialog />
    </div>
  );
}

/** Warms every shell chunk so tests can render any variant without a Suspense race. */
const preloadAppLayoutVariants = () =>
  Promise.all([loadSidebar(), loadTopNav(), loadRail(), loadFocus()]);

/** Re-export for tests and direct imports that need the outlet shell without routing. */
/* eslint-disable react-refresh/only-export-components -- test-facing re-exports beside the layout */
export {
  APP_SHELL_VARIANT,
  AppLayoutShell,
  preloadAppLayoutVariants,
  resolveAppShellVariant,
};
/* eslint-enable react-refresh/only-export-components */
