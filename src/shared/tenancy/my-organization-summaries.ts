import { API_BASE_PATH } from '@/core/config/constants.ts';
import { queryClient } from '@/core/http/queryClient.ts';
import { fetchAllPages } from '@/shared/api/fetch-all-pages.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import {
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
 * - **No `isActive` here.** Which organization is active is not a fact about the
 *   list: it moves on every switch while the membership set stays put. Stamping
 *   it at fetch time tied this request to me/context — a list that landed first
 *   would be cached with nothing active for the whole session, so the two
 *   requests could not be sent together. {@link useMyOrganizationSummaries}
 *   derives it on read.
 */
export async function fetchMyOrganizationSummaries(): Promise<OrganizationSummary[]> {
  const rows = await fetchAllPages(
    `${API_BASE_PATH}/users/me/organizations`,
    organizationWire,
    'organizations',
  );
  return rows.map((row) => toOrganization(row));
}

/**
 * The list, from cache when it is there and over the network when it is not.
 *
 * @remarks
 * For the guard chain, which is plain async code rather than a component. It
 * runs on EVERY organization-route navigation, so it must not refetch each
 * time — it serves the cached list and only fetches on a miss.
 */
export async function ensureMyOrganizationSummaries(): Promise<OrganizationSummary[]> {
  // `query({ staleTime: 'static' })`, not the deprecated `ensureQueryData`:
  // the cached list is served as-is and the network is touched only on a miss,
  // which is the whole point on a path that runs per navigation.
  return queryClient.query({
    queryKey: myOrganizationsQueryKey,
    queryFn: fetchMyOrganizationSummaries,
    staleTime: 'static',
  });
}

/**
 * Send the list request now, without waiting for the answer.
 *
 * @remarks
 * For `hydrateSessionContext()`: the organization guard needs the list as well
 * as me/context, and neither request reads the other's answer, so the list goes
 * out alongside me/context rather than after it — one round trip off every cold
 * load and sign-in. It is {@link ensureMyOrganizationSummaries}, un-awaited:
 * cache-first, so a session that already holds the list sends nothing, and the
 * guard's own read joins the request in flight instead of starting a second. A
 * failure is left to that read, which fetches again and reports its own error.
 */
export function prefetchMyOrganizationSummaries(): void {
  void ensureMyOrganizationSummaries().catch(() => undefined);
}

/** Drop the cached list so the next read refetches (after a switch, create or leave). */
export function invalidateMyOrganizationSummaries(): void {
  void queryClient.invalidateQueries({ queryKey: myOrganizationsQueryKey });
}

/**
 * The caller's organizations, each flagged if it is the active one, for components.
 *
 * @remarks
 * - Shares {@link myOrganizationsQueryKey} with {@link ensureMyOrganizationSummaries},
 *   so a guard that already resolved the list hands it to the first render rather
 *   than every surface fetching its own copy.
 * - **`isActive` is derived on read,** from the organization store: the context
 *   the URL drives, and the one RBAC reads. It follows a switch or a navigation
 *   the moment the store moves, without rewriting the cached list, and it cannot
 *   be wrong for a list that arrived before me/context did.
 */
export function useMyOrganizationSummaries() {
  const activeId = useOrganizationStore((state) => state.organizationId);
  return useAppQuery({
    queryKey: myOrganizationsQueryKey,
    queryFn: fetchMyOrganizationSummaries,
    select: (organizations): MyOrganizationSummary[] =>
      organizations.map((organization) => ({
        ...organization,
        isActive: organization.id === activeId,
      })),
    // Surfaces render a placeholder or an empty list; none of them wants a toast
    // because an organization list is momentarily unavailable.
    notifyOnError: false,
  });
}
