import { platformConfig } from '@/core/config/env.ts';
import { onceAsync } from '@/lib/lazy-module.ts';
import {
  type AppShellVariant,
  resolveAppShellVariant,
} from '@/shared/layouts/AppLayout/resolve-app-shell.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import {
  mergeDeploymentFlags,
  resolveDeploymentMode,
} from '@/shared/tenancy/deployment-mode.ts';

/**
 * Chunk loaders for the app shell variants — deliberately their own module.
 *
 * `AppLayout.tsx` needs them for `React.lazy`; the route tree needs them to warm
 * the shell the session calls for from a route `loader`, in parallel with the
 * route's own chunks. If they lived in `AppLayout.tsx`, importing them from the
 * route tree (entry chunk) would drag the whole layout onto first paint.
 *
 * Each shell is fetched on first call and shared from then on (`onceAsync`). A
 * module-scope `import()` would instead fetch all four the moment this module
 * evaluates, which defeats the split.
 */
export const loadSidebarShell = onceAsync(
  () => import('./variants/AppLayoutSidebar.tsx'),
);
/** Top-nav shell chunk (preview variant 1). */
export const loadTopNavShell = onceAsync(() => import('./variants/AppLayoutTopNav.tsx'));
/** Icon-rail shell chunk (preview variant 2). */
export const loadRailShell = onceAsync(() => import('./variants/AppLayoutRail.tsx'));
/** Focus shell chunk — what a personal-only deployment mounts. */
export const loadFocusShell = onceAsync(() => import('./variants/AppLayoutFocus.tsx'));

/** Chunk loaders in `APP_SHELL_VARIANT` order — index-aligned with `APP_SHELLS`. */
const APP_SHELL_LOADERS = [
  loadSidebarShell,
  loadTopNavShell,
  loadRailShell,
  loadFocusShell,
] as const;

/** Fetch one shell's chunk without mounting it. */
export function preloadAppShellVariant(variant: AppShellVariant): Promise<unknown> {
  return (APP_SHELL_LOADERS[variant] ?? loadFocusShell)();
}

/**
 * Warm the shell the CURRENT session calls for — for a route `loader`.
 *
 * `AppLayout` picks its shell from the session's deployment flags, and used to
 * start fetching it only once it had mounted: route chunks → mount → skeleton →
 * shell chunk → shell. By the time a shell route's `loader` runs, its
 * `beforeLoad` has already put `me/context` in the org store, so the same
 * decision can be made here and the shell fetched IN PARALLEL with the route's
 * own chunks. `AppLayout` then finds it in memory and mounts it without a
 * skeleton frame. Same inputs as the component (store flags + env overrides +
 * the preview variant), so the two cannot disagree; a miss just costs a chunk.
 */
export function preloadSessionAppShell(): Promise<unknown> {
  const flags = mergeDeploymentFlags(
    useOrganizationStore.getState().deploymentFlags,
    platformConfig.deploymentOverrides,
  );
  return preloadAppShellVariant(
    resolveAppShellVariant(
      resolveDeploymentMode(flags),
      useThemeStore.getState().appVariant,
    ),
  );
}

/** Warms every shell chunk so tests can render any variant without a Suspense race. */
export function preloadAllAppShellVariants(): Promise<unknown> {
  return Promise.all(APP_SHELL_LOADERS.map((load) => load()));
}
