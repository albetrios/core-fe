import { API_BASE_PATH } from '@/core/config/constants.ts';
import { queryClient } from '@/core/http/queryClient.ts';
import { fetchAllPages } from '@/shared/api/fetch-all-pages.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';

import {
  type MeContext,
  meContextQueryKey,
  type OrganizationSummary,
  organizationWire,
  toOrganization,
} from './me-context.ts';

/** One organization the caller belongs to, flagged if it is the active one. */
export type MyOrganizationSummary = OrganizationSummary & { isActive: boolean };

/** Cache key for the caller's own organization list. */
export const myOrganizationsQueryKey = ['tenancy', 'my-organizations'] as const;

/**
 * Every organization the caller belongs to, from `GET /users/me/organizations`.
 *
 * @remarks
 * - **Why not `/auth/me/context`:** it used to carry this list, but as a flat
 *   array with no cursor filled by a default-paginated read — so a caller in
 *   more than 25 organizations saw a silently truncated switcher and had no way
 *   to ask for the rest. This endpoint pages, and {@link fetchAllPages} follows
 *   the cursor to the end.
 * - **Why the same mapper:** `toOrganization` is the one me/context uses for the
 *   active organization, so a row from either source lands on an identical
 *   {@link OrganizationSummary}. Consumers changed source, not shape.
 * - **`isActive`** is derived here rather than sent: the server no longer has to
 *   know which organization the client considers active in order to describe the
 *   list, and the flag stays correct after a switch updates me/context.
 */
export async function fetchMyOrganizationSummaries(): Promise<MyOrganizationSummary[]> {
  const rows = await fetchAllPages(
    `${API_BASE_PATH}/users/me/organizations`,
    organizationWire,
    'organizations',
  );
  const activeId = queryClient.getQueryData<MeContext>(meContextQueryKey)?.activeOrganization
    ?.id;
  return rows.map((row) => ({ ...toOrganization(row), isActive: row.id === activeId }));
}

/**
 * The list, from cache when it is there and over the network when it is not.
 *
 * @remarks
 * For the guard chain, which is plain async code rather than a component. It
 * runs on EVERY organization-route navigation, so it must not refetch each
 * time — `ensureQueryData` returns the cached list and only fetches on a miss.
 */
export async function ensureMyOrganizationSummaries(): Promise<MyOrganizationSummary[]> {
  return queryClient.ensureQueryData({
    queryKey: myOrganizationsQueryKey,
    queryFn: fetchMyOrganizationSummaries,
  });
}

/** Drop the cached list so the next read refetches (after a switch, create or leave). */
export function invalidateMyOrganizationSummaries(): void {
  void queryClient.invalidateQueries({ queryKey: myOrganizationsQueryKey });
}

/**
 * The caller's organizations, for components.
 *
 * @remarks
 * Shares {@link myOrganizationsQueryKey} with {@link ensureMyOrganizationSummaries},
 * so a guard that already resolved the list hands it to the first render rather
 * than every surface fetching its own copy.
 */
export function useMyOrganizationSummaries() {
  return useAppQuery({
    queryKey: myOrganizationsQueryKey,
    queryFn: fetchMyOrganizationSummaries,
    // Surfaces render a placeholder or an empty list; none of them wants a toast
    // because an organization list is momentarily unavailable.
    notifyOnError: false,
  });
}
