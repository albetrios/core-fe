import type { z } from 'zod';

import type { OrganizationPermission } from '@/core/rbac/policies.ts';

/**
 * Per-action permission map for a resource. `null` means "no specific
 * permission" (auth-only). Mirrors the standard CRUD verbs.
 */
export interface ResourcePermissions {
  list: OrganizationPermission | null;
  show: OrganizationPermission | null;
  create: OrganizationPermission | null;
  update: OrganizationPermission | null;
  delete: OrganizationPermission | null;
}

/**
 * Optional UI metadata used by the nav menu and breadcrumbs.
 */
export interface ResourceUI {
  /** Human-readable label (e.g. "Organizations"). */
  label: string;
  /** Lucide icon name (e.g. "Building"). */
  icon?: string;
  /** When true, the resource appears in the sidebar nav. */
  showInNav?: boolean;
}

/**
 * Resource manifest — single source of truth declaring how a backend
 * resource is fetched, validated, gated, and presented. Consumed by:
 *
 *   - Standard CRUD hooks (`useList`, `useOne`, ...) — read `endpoint`
 *   - Route loaders — read `permissions` to gate access
 *   - Nav menu / breadcrumbs — read `ui`
 *
 * Resource pages live in `src/pages/<resource>/` and export their manifest
 * from `<resource>.resource.ts`.
 */
export interface Resource<TSchema extends z.ZodType = z.ZodType> {
  /** Resource name (`'organizations'`, `'members'`, ...). Used as the URL
   *  segment after `/api/v1/` and as the React Query key namespace. */
  name: string;
  /** Override the default `/api/v1/<name>` path when the backend is
   *  non-standard (e.g. nested under an org). */
  endpoint?: string;
  /** Zod schema for a single record. The list endpoint is assumed to
   *  return `T[]` or `{ data: T[], total }`. */
  schema: TSchema;
  /** Per-action RBAC permissions. */
  permissions: ResourcePermissions;
  /** Optional UI metadata for nav/breadcrumb generation. */
  ui?: ResourceUI;
}
