import { queryClient } from '@/core/http/queryClient.ts';
import { getMyPermissions } from '@/shared/api/organization-api.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { type MeContext, meContextQueryKey } from './me-context.ts';
import type { Organization } from './my-organizations.ts';
import { listMyOrganizations, organizationSchema } from './my-organizations.ts';
import { invalidateSessionContext } from './session-context.ts';

function organizationFromMeContext(ctx: MeContext, slug: string): Organization | null {
  const summary = ctx.organizations.find((o) => o.slug === slug);
  if (!summary?.slug) return null;
  return organizationSchema.parse({
    id: summary.id,
    name: summary.name,
    slug: summary.slug,
    status: summary.status === 'SUSPENDED' ? 'suspended' : 'active',
    logoUrl: summary.logoUrl,
  });
}

/**
 * Membership + per-organization permission loading.
 *
 * Permissions are scoped to ONE organization — switching organizations via the
 * URL must refetch them. `ensurePermissionsFor` tracks which organization the
 * cached set belongs to and invalidates on change (a once-if-empty check is
 * not enough; it would leak org A's permissions into org B's UI).
 */

/**
 * The organization, if the signed-in user is a member; otherwise `null`.
 *
 * Perf note: `listMyOrganizations()` is the live tenancy API, but this runs on
 * EVERY org-route navigation (guard chain). A future optimization is to put it
 * behind the query cache (staleTime) so per-nav guard checks reuse the list
 * instead of refetching it.
 */
export async function findMembership(
  organizationId: string,
): Promise<Organization | null> {
  const organizations = await listMyOrganizations();
  return organizations.find((o) => o.id === organizationId) ?? null;
}

/**
 * The organization whose **slug** matches, if the user is a member; else `null`.
 * Team URLs carry the human-readable slug (FE-22); the guard resolves it to the
 * canonical org (and its immutable id) here. Existence is never leaked: a
 * non-member slug resolves to `null` → 404, identical to an unknown slug.
 */
export async function findMembershipBySlug(slug: string): Promise<Organization | null> {
  // Cache-first: the org guard chain runs requireProvisionedWorkspace →
  // hydrateSessionContext() (which setQueryData's me/context) BEFORE this, so the
  // cache is warm and carries the org list — resolve from it without a second
  // network call. INVARIANT: relies on me/context being fetched first; if a future
  // route skips that, we fall back to the network below (no bug, just no speedup).
  const ctx = queryClient.getQueryData<MeContext>(meContextQueryKey);
  if (ctx) {
    const fromContext = organizationFromMeContext(ctx, slug);
    if (fromContext) return fromContext;
  }

  // Fallback on cache miss only — never 404 a real member just because me/context
  // didn't list the slug; the list call is the authoritative membership source.
  const organizations = await listMyOrganizations();
  return organizations.find((o) => o.slug === slug) ?? null;
}

let permissionsLoadedFor: string | null = null;

/** Load org-scoped permissions into the store, refetching when the organization changed. */
export async function ensurePermissionsFor(organizationId: string): Promise<void> {
  const store = useOrganizationStore.getState();
  if (permissionsLoadedFor === organizationId && store.permissions.length > 0) return;
  // Org changed (or first load): clear stale grants up front so a *failed*
  // refetch leaves an empty (deny-all) set rather than the previous org's
  // permissions — never carry one tenant's grants into another.
  if (permissionsLoadedFor !== organizationId) {
    permissionsLoadedFor = null;
    // Clear, not "set to empty": an empty ANSWER hides gated controls, while an
    // unresolved set holds their place until the real one lands (SET-23).
    store.clearPermissions();
  }
  // Permissions come live from the me-context (`getMyPermissions` filters the
  // active org's grants, which the token already scopes to this organization).
  // A future dedicated org-scoped endpoint (org id in the path) could replace
  // the me-context read without changing this call site.
  store.setPermissions(await getMyPermissions());
  permissionsLoadedFor = organizationId;
}

/** Drop session + permission caches after a server-side context mutation. */
export function invalidateMembershipContext(): void {
  invalidateSessionContext();
  permissionsLoadedFor = null;
}

/** Test-only: reset the per-organization permission cache. */
export function resetPermissionCacheForTests(): void {
  permissionsLoadedFor = null;
}
