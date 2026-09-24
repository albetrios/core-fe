import { queryClient } from '@/core/http/queryClient.ts';

import { fetchMeContext, type MeContext, meContextQueryKey } from './me-context.ts';
import {
  myOrganizationsQueryKey,
  prefetchMyOrganizationSummaries,
} from './my-organization-summaries.ts';
import { deriveOrgContext } from './organization-context.ts';
import { resetPermissionCacheForTests } from './organization-membership.ts';

let contextGeneration = 0;

/**
 * Drop the cached `me/context`, and the organization list loaded with it, so the
 * next read refetches from the API. Call after logout, org switch side-effects
 * that bypass the switch endpoint, or any mutation that changes session context
 * server-side.
 *
 * @remarks
 * The list goes too because {@link hydrateSessionContext} sends it alongside
 * me/context, and it is cached with `staleTime: 'static'`. Left behind — by a
 * cold load whose me/context failed after the list arrived, say — it would be
 * served to the next sign-in in this tab, whoever signs in. Removing the query
 * also cancels a list request still in flight.
 */
export function invalidateSessionContext(): void {
  contextGeneration += 1;
  queryClient.removeQueries({ queryKey: meContextQueryKey });
  queryClient.removeQueries({ queryKey: myOrganizationsQueryKey });
}

/**
 * Load the authoritative session context and seed the React Query cache +
 * derived org store — shared by `/` resolution, workspace guards, and auth
 * bootstrap.
 *
 * @remarks
 * Also sends the organization list request, alongside me/context rather than
 * after it: the organization guard needs both answers, and neither request reads
 * the other's. On a cold load or a sign-in that is one round trip fewer before
 * the first route renders. Cache-first, so a session that already holds the list
 * sends nothing.
 */
export async function hydrateSessionContext(
  isCurrent: () => boolean = () => true,
): Promise<MeContext> {
  const generation = contextGeneration;
  prefetchMyOrganizationSummaries();
  const ctx = await fetchMeContext();
  if (generation !== contextGeneration || !isCurrent()) {
    throw new DOMException('Session context superseded', 'AbortError');
  }
  queryClient.setQueryData(meContextQueryKey, ctx);
  deriveOrgContext(ctx);
  return ctx;
}

/**
 * Cache-first session context for the read-only route guards and the `/`
 * resolver. Reuses the `me/context` that `establishSession` / `silentRefresh` /
 * an org switch just wrote, and only hits the network when the cache is empty
 * (cold boot or a direct-URL visit).
 *
 * This is what keeps the post-auth guard chain from firing a **redundant**
 * `me/context` fetch: `establishSession` populates the cache microseconds before
 * the destination route's `beforeLoad` runs, and during an awaited `beforeLoad`
 * TanStack Router keeps the *previous* screen (the login form) mounted — so an
 * extra fetch there paints `/login` while the URL already reads `/dashboard`
 * (the "flash of login" between the OTP code and the dashboard). Mutations that
 * change server-side context (onboarding finish, org create, logout) call
 * `hydrateSessionContext()` / `invalidateSessionContext()` directly, so a stale
 * routing decision cannot persist; `me/context` staleTime (60s) governs the rest.
 */
export async function ensureSessionContext(): Promise<MeContext> {
  const cached = queryClient.getQueryData<MeContext>(meContextQueryKey);
  if (cached) {
    // Keep the derived org store in lock-step even on the cache-first path
    // (idempotent: it re-syncs the same values the cache was seeded with).
    deriveOrgContext(cached);
    return cached;
  }
  return hydrateSessionContext();
}

/** Test-only: clear session cache and permission tracking. */
export function resetSessionContextForTests(): void {
  invalidateSessionContext();
  resetPermissionCacheForTests();
}
