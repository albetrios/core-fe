import { queryClient } from '@/core/http/queryClient.ts';
import {
  getMyPermissions,
  toOrganizationPermissions,
} from '@/shared/api/organization-api.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { type MeContext, meContextQueryKey } from './me-context.ts';
import { ensureMyOrganizationSummaries } from './my-organization-summaries.ts';
import type { Organization } from './my-organizations.ts';
import { listMyOrganizations, organizationSchema } from './my-organizations.ts';

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
  // Cache-first, but off the LIST's own cache rather than me/context: the list
  // no longer rides along with the context, and this runs on every
  // organization-route navigation, so it must not refetch each time.
  // `ensureMyOrganizationSummaries` serves the cached list and only goes to the
  // network on a miss — the speedup the old me/context fast path was for, now
  // without depending on another query having been fetched first.
  const organizations = await ensureMyOrganizationSummaries();
  const match = organizations.find((o) => o.slug === slug);
  if (!match?.slug) return null;
  return organizationSchema.parse({
    id: match.id,
    name: match.name,
    slug: match.slug,
    status: match.status === 'SUSPENDED' ? 'suspended' : 'active',
    logoUrl: match.logoUrl,
  });
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
  // Permissions come live from the me-context (the token already scopes its
  // grants to this organization). Cache-first for the same reason as
  // `findMembershipBySlug` above, and it matters most right after sign-in: the
  // guard chain runs `requireProvisionedWorkspace` → `ensureSessionContext()`
  // immediately before this, so the cache is warm, and a second network read
  // here held the auth screen up for a whole extra round trip while the URL
  // already pointed at the destination (LOGIN-7). Same INVARIANT as above — on
  // a cache miss we fall back to the network, which is correct, just slower.
  const cached = queryClient.getQueryData<MeContext>(meContextQueryKey);
  store.setPermissions(
    cached ? toOrganizationPermissions(cached.myPermissions) : await getMyPermissions(),
  );
  permissionsLoadedFor = organizationId;
}

/** Test-only: reset the per-organization permission cache. */
export function resetPermissionCacheForTests(): void {
  permissionsLoadedFor = null;
}
