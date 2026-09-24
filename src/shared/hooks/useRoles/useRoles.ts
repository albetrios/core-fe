import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import * as orgApi from '@/shared/api/organization-api.ts';
import type { RoleInput, RoleSummary } from '@/shared/api/organization-contracts.ts';
import {
  type OrgListKeyParams,
  orgQueryKeys,
} from '@/shared/api/organization-query-keys.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import { useAppQuery } from '@/shared/hooks/useAppQuery/index.ts';
import { useCan } from '@/shared/hooks/useCan/index.ts';
import {
  type CursorListResult,
  useCursorList,
} from '@/shared/hooks/useCursorList/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/** Server-side query params for the roles list (search + sort). */
export type RolesListParams = OrgListKeyParams;

/**
 * Roles of the active organization — windowed list query + create/update/delete
 * mutations. Server state only — never mirrored into Zustand (fe-file-structure.mdc).
 */
export function useRoles(params: RolesListParams = {}): CursorListResult<RoleSummary> {
  const orgId = useOrganizationStore((s) => s.organizationId);
  // `GET /tenancy/organization/roles` enforces `role:read`. The members panel calls this hook
  // from every member row regardless of whether it will render a role picker, so without this
  // guard the seeded **Viewer** role — which holds `organization:read` + `membership:read` and
  // nothing else — fired a guaranteed 403 every time it opened Settings → Members. The failure
  // was invisible in the UI (`notifyOnError: false`) but core-be writes a permission-deny audit
  // row on every denial, so it was a request worth not making.
  const canReadRoles = useCan({ permission: 'role:read' });
  return useCursorList<RoleSummary>({
    queryKey: orgQueryKeys.rolesList(orgId, params),
    queryFn: (after) => orgApi.listRoles({ ...params, after }),
    // The roles panel renders a RetryError for exactly this failure.
    notifyOnError: false,
    // No active org (mid org-switch, or before context resolves) → skip the
    // request instead of firing a `Forbidden` against an empty org scope.
    enabled: Boolean(orgId) && canReadRoles,
  });
}

/**
 * A single role's permission codes. The roles list omits permissions, so the
 * edit form reads them here to pre-fill. Held until a `roleId` is provided.
 */
export function useRolePermissions(roleId: string | undefined) {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppQuery({
    queryKey: [...orgQueryKeys.roles(orgId), 'permissions', roleId],
    queryFn: () => orgApi.getRolePermissions(roleId ?? ''),
    enabled: roleId !== undefined,
  });
}

/** Create a custom role, then refresh the roles list. */
export function useCreateRole() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (input: RoleInput) => orgApi.createRole(input),
    invalidateKeys: [orgQueryKeys.roles(orgId)],
    successMessage: (role) =>
      i18n.t(ERRORS_KEYS.frontend.hooks.roles.createSuccess, {
        ns: ERRORS_NS,
        name: role.name,
      }),
  });
}

/** Update a custom role — optimistically patches the renamed row. */
export function useUpdateRole() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (input: RoleInput & { id: string }) => orgApi.updateRole(input),
    invalidateKeys: [orgQueryKeys.roles(orgId)],
    optimisticInfinite: {
      queryKey: orgQueryKeys.roles(orgId),
      update: (rows: RoleSummary[], input) =>
        rows.map((role) => (role.id === input.id ? { ...role, name: input.name } : role)),
    },
    successMessage: (role) =>
      i18n.t(ERRORS_KEYS.frontend.hooks.roles.updateSuccess, {
        ns: ERRORS_NS,
        name: role.name,
      }),
  });
}

/** Delete a custom role — optimistically drops it from the list. */
export function useDeleteRole(options?: { suppressSuccessToast?: boolean }) {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (roleId: string) => orgApi.deleteRole(roleId),
    invalidateKeys: [orgQueryKeys.roles(orgId)],
    optimisticInfinite: {
      queryKey: orgQueryKeys.roles(orgId),
      update: (rows: RoleSummary[], roleId) => rows.filter((role) => role.id !== roleId),
    },
    // See useRemoveMember: the undo toast owns the messaging on deferred paths.
    successMessage: options?.suppressSuccessToast
      ? undefined
      : i18n.t(ERRORS_KEYS.frontend.hooks.roles.deleteSuccess, { ns: ERRORS_NS }),
  });
}
