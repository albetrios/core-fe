import type { OrganizationPermission } from '@/core/types/permissions.ts';

/**
 * Shape for `<page>.manifest.ts` in every route island (leaf or layout).
 * Single manifest for layout vs leaf: path, RBAC, testId, child segments.
 * React UI: top-level `<Page>Page.tsx` or `<Page>Layout.tsx` at the island root.
 * Tests: colocated `*.test.tsx` beside source. See fe-route-island skill.
 */
type RouteIslandKind = 'leaf' | 'layout';

export type PageManifest = {
  /** URL segment for this folder (not the full path). */
  segment: string;
  /** Full pathname this island serves. */
  path: string;
  /**
   * Human document title for this page ("Sign in", "Dashboard"). Rendered as
   * `<title>` via the route's `head` (see `manifestHead`) and announced to
   * screen readers by `RouteAnnouncer` on SPA navigations.
   */
  title: string;
  /** Primary page container `data-testid`. */
  testId: string;
  /** Loader permission; `null` when inherited or public. */
  permission: OrganizationPermission | null;
  /**
   * Feature-module key this route belongs to (L6b). When the deployment disables
   * the module (`VITE_DISABLED_MODULES`), the route resolves to `notFound()`.
   */
  module?: string;
  /**
   * What a denied access resolves to: `'unauthorized'` (403 page — "you can't
   * do this") or `'notFound'` (404 — hide the surface's existence). Default
   * `'unauthorized'`.
   */
  onDeny?: 'unauthorized' | 'notFound';
  /** `layout` = has `<Outlet />` and `children`; `leaf` = terminal UI. */
  kind: RouteIslandKind;
  /**
   * URL segment names for child routes. On disk (layout islands) children nest
   * DIRECTLY as `<segment>/` — the pages tree mirrors the URL tree 1:1, no
   * `sub-pages/` bucket (routing-and-tenancy.md §3). Same recursive island
   * shape at every depth; `$param` segments keep their `$` in the folder name.
   */
  children: readonly string[];
};
