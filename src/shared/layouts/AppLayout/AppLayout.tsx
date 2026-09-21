import { useParams } from '@tanstack/react-router';
import { lazy, startTransition, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { CommandPaletteLazy } from '@/shared/components/CommandPalette/index.ts';
import { KeyboardShortcutsLazy } from '@/shared/components/KeyboardShortcutsDialog/KeyboardShortcutsLazy.tsx';
import { SessionTimeoutDialog } from '@/shared/components/SessionTimeoutDialog/index.ts';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { WorkspaceSwitchOverlay } from '@/shared/components/WorkspaceSwitchOverlay/index.ts';
import { reportError } from '@/shared/errors/errorHandler.ts';
import { useVisibleNav } from '@/shared/hooks/useCan/index.ts';
import { useDeploymentFlagsState } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useOrgBrand } from '@/shared/hooks/useOrgBrand/index.ts';
import {
  loadFocusShell,
  loadRailShell,
  loadSidebarShell,
  loadTopNavShell,
  preloadAllAppShellVariants,
  preloadAppShellVariant,
} from '@/shared/layouts/AppLayout/app-layout-variants.ts';
import { NAV_ITEMS, SkipLink } from '@/shared/layouts/AppLayout/AppLayout.shared.tsx';
import {
  type AppShellVariant,
  resolveAppShellVariant,
} from '@/shared/layouts/AppLayout/resolve-app-shell.ts';
import { LayoutVariantFallback } from '@/shared/layouts/LayoutVariantFallback/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import { resolveDeploymentMode } from '@/shared/tenancy/deployment-mode.ts';

// The loaders live in `app-layout-variants.ts` so the route tree can warm the
// shell a session calls for without importing this layout into the entry chunk.
const SidebarShell = lazy(() =>
  loadSidebarShell().then((m) => ({ default: m.SidebarShell })),
);
const TopNavShell = lazy(() =>
  loadTopNavShell().then((m) => ({ default: m.TopNavShell })),
);
const RailShell = lazy(() => loadRailShell().then((m) => ({ default: m.RailShell })));
const FocusShell = lazy(() => loadFocusShell().then((m) => ({ default: m.FocusShell })));

/** In `APP_SHELL_VARIANT` order — index-aligned with the loaders. */
const APP_SHELLS = [SidebarShell, TopNavShell, RailShell, FocusShell] as const;

/**
 * What sits inside the shell boundary: the failure, the skeleton, or the shell.
 *
 * A separate component on purpose — a throw in the component that RENDERS a
 * boundary escapes past it to the next one up, which here is the whole
 * authenticated app. Rejected preloads never render on their own, so re-throwing
 * from inside is what puts one in reach of the retry this boundary provides.
 */
function ShellSlot({
  shellError,
  mounted,
  navItems,
  organizationSlug,
}: {
  shellError: unknown;
  mounted: AppShellVariant | null;
  navItems: typeof NAV_ITEMS;
  organizationSlug: string;
}) {
  if (shellError !== null) throw shellError;
  if (mounted === null) return <LayoutVariantFallback />;
  return (
    <AppLayoutShell
      variant={mounted}
      navItems={navItems}
      organizationSlug={organizationSlug}
    />
  );
}

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
  const { t } = useTranslation(ERRORS_NS);
  const navItems = useVisibleNav(NAV_ITEMS);
  const { organizationSlug = '' } = useParams({ strict: false });
  const themeVariant = useThemeStore((s) => s.appVariant);
  const { flags, ready } = useDeploymentFlagsState();
  // House rule 4: the shell is derived ONLY from loaded session context. Before
  // it lands, `flags` is the permissive DEFAULT_DEPLOYMENT_FLAGS guess — deriving
  // a shell from it mounts one frame and then replaces it with another.
  const target = ready
    ? resolveAppShellVariant(resolveDeploymentMode(flags), themeVariant)
    : null;

  /**
   * The shell that is actually mounted. It only ever changes once the NEXT
   * shell's chunk is already in memory, so the old one is never swapped out for
   * a Suspense fallback — that swap is what blanked the page, remounted the
   * routed island under it, and lost the user's scroll position (SHELL-1).
   */
  const [mounted, setMounted] = useState<AppShellVariant | null>(null);
  /**
   * A shell chunk that never arrives.
   *
   * The preload used to be `void …then(setMounted)` with no rejection handler,
   * so a failed fetch — a network blip, or the classic stale-hash 404 in the
   * minutes after a deploy — left `mounted` at null FOREVER. That renders
   * `LayoutVariantFallback`, which has no `<Outlet/>`: no page content, no error,
   * no retry, and nothing in Sentry beyond an unhandled rejection. The effect
   * deps never change again, so it never re-tried either, and the boundary below
   * could not help because nothing ever threw during render.
   *
   * Held in state and re-thrown in render so it reaches that boundary, which is
   * where the retry already lives. Clearing it is only half of a retry, though —
   * see `preloadAttempt` for the other half.
   */
  const [shellError, setShellError] = useState<unknown>(null);
  /**
   * Retry epoch — the only effect dep that pressing Retry actually changes.
   *
   * Clearing `shellError` alone looks like a retry and is not one. The preload
   * lives in an effect keyed on the shell it is fetching, and a reset moves
   * neither key: `target` is derived from session context that has not changed,
   * and `mounted` is still null precisely because the fetch never landed. So
   * `preloadAppShellVariant` was never called again, and the render after Retry
   * fell through to `LayoutVariantFallback` — the same `<Outlet/>`-less
   * permanent skeleton described above, now with the error card gone too, so
   * there was nothing left to press. The button was decoration.
   *
   * Bumping this re-runs the effect, and `onceAsync` drops its cached promise on
   * rejection (see `lib/lazy-module.ts`), so the loader really refetches instead
   * of replaying the stored failure.
   */
  const [preloadAttempt, setPreloadAttempt] = useState(0);

  useEffect(() => {
    if (target === null || target === mounted) return;
    let cancelled = false;
    void preloadAppShellVariant(target)
      .then(() => {
        if (cancelled) return;
        // A transition, so React can keep the current shell interactive while it
        // renders the replacement instead of tearing straight down to a fallback.
        startTransition(() => setMounted(target));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        reportError(error, {
          scope: 'app-shell-preload',
          variant: String(target),
          // Distinguishes "the chunk is gone" from "one blip, recovered on
          // retry" in Sentry — and keeps `preloadAttempt` an honest dependency
          // rather than a suppressed one.
          attempt: String(preloadAttempt),
        });
        setShellError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [target, mounted, preloadAttempt]);

  return (
    <div className="bg-background flex h-screen overflow-hidden" data-testid="app-layout">
      <SkipLink />
      <WorkspaceSwitchOverlay />
      {/* House rule 2. The variants render nav, brand, quick links and the user
          menu; without this, a throw in any of them escalates to the route
          boundary and replaces the whole authenticated application. Contained
          here the user keeps a retry, and the dialogs below stay mounted. */}
      <SectionErrorBoundary
        title={t(ERRORS_KEYS.widget.navigation)}
        testId="app-shell-error"
        onReset={() => {
          // Both halves, or neither works: clear the stored failure so the
          // boundary stops re-throwing, AND bump the epoch so the effect
          // actually refetches. Clearing alone just swaps the error card for a
          // skeleton that never resolves and offers no second try.
          setShellError(null);
          setPreloadAttempt((attempt) => attempt + 1);
        }}
      >
        {/*
          Thrown from INSIDE the boundary, not from AppLayout's own render — a
          throw in the component that RENDERS a boundary escapes past it to the
          next one up, which here is the whole authenticated app. Rejected
          preloads never render on their own, so re-throwing in a child is what
          puts one in reach of the retry this boundary already provides.
        */}
        <ShellSlot
          shellError={shellError}
          mounted={mounted}
          navItems={navItems}
          organizationSlug={organizationSlug}
        />
      </SectionErrorBoundary>
      <CommandPaletteLazy />
      <KeyboardShortcutsLazy />
      <SessionTimeoutDialog />
    </div>
  );
}

/** Re-export for tests and direct imports that need the outlet shell without routing. */
/* eslint-disable react-refresh/only-export-components -- test-facing re-exports beside the layout */
export { preloadAllAppShellVariants as preloadAppLayoutVariants };
/* eslint-enable react-refresh/only-export-components */
