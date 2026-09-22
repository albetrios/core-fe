import type { PermissionCatalogEntry } from '@/shared/api/organization-api.ts';
import { listPermissionCatalog } from '@/shared/api/organization-api.ts';
import { orgQueryKeys } from '@/shared/api/organization-query-keys.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/** What the permission pickers need: the rows to render plus the query's own state. */
export interface AssignablePermissions {
  rows: PermissionCatalogEntry[];
  isPending: boolean;
  isError: boolean;
}

/**
 * The permissions this caller may actually grant — the backend catalog intersected with the
 * caller's own permission set.
 *
 * @remarks
 * Two separate reasons for the intersection, and both matter. core-be's
 * `assertCallerCanGrantPermissionCodes` refuses any code the caller does not personally hold,
 * so offering the full catalog would present grants that error on submit. And the set must be
 * the **literal** `my_permissions` from the active organization, never `hasPermission()` —
 * that helper is the UI's own view and would re-introduce exactly the kind of client-side
 * optimism this replaces.
 *
 * The catalog itself is reference data: cached org-independently with a long `staleTime`, and
 * served from a 304 on refetch (core-be sends an ETag).
 */
export function useAssignablePermissions(): AssignablePermissions {
  const held = useOrganizationStore((s) => s.permissions);
  const query = useAppQuery({
    queryKey: orgQueryKeys.permissionCatalog(),
    queryFn: listPermissionCatalog,
    staleTime: 60_000,
    // Both pickers render their own inline error state.
    notifyOnError: false,
  });

  const heldCodes = new Set<string>(held);
  return {
    rows: (query.data ?? []).filter((entry) => heldCodes.has(entry.code)),
    isPending: query.isPending,
    isError: query.isError,
  };
}
