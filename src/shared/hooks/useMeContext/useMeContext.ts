import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';
import { fetchMeContext, meContextQueryKey } from '@/shared/tenancy/me-context.ts';

/** Query key for the caller's session context (defined in the data module). */
export { meContextQueryKey };

interface UseMeContextOptions {
  /**
   * Rethrow a failed fetch during render so the nearest `SectionErrorBoundary`
   * catches it, replacing this widget with a fallback. Right for a page section
   * that owns its own space; **wrong for app chrome**, where swapping a control
   * for an error card reflows the header the user is still trying to use.
   * Default: false.
   */
  throwOnError?: boolean;
  /**
   * Toast the failure — one message, with a Retry that refetches, and not a
   * pixel of layout moved. This is the chrome's surface: the org switcher and
   * the verification banner keep their shape and their last known data, and the
   * news arrives beside them (X-1).
   *
   * Defaults to **true**, and every caller should leave it there. `meta` is a
   * property of the QUERY, not of an observer, so the last consumer to mount
   * decides it for all of them — and `me/context` has a dozen consumers. One
   * query, one policy; the cache de-dupes the toast by query hash, so a failure
   * is reported once no matter how many widgets are watching.
   */
  notifyOnError?: boolean;
}

/**
 * The caller's session context — user, active organization (+ status),
 * resolved permissions, global role, and the org-switcher list
 * (`GET /auth/me/context`). Server state via TanStack Query; never mirrored
 * into Zustand. Powers the dashboard today; nav/RBAC/settings later.
 */
export function useMeContext({
  throwOnError = false,
  notifyOnError = true,
}: UseMeContextOptions = {}) {
  return useAppQuery({
    queryKey: meContextQueryKey,
    queryFn: fetchMeContext,
    staleTime: 60_000,
    throwOnError,
    notifyOnError,
  });
}
