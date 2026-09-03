import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import * as orgApi from '@/shared/api/organization-api.ts';
import type {
  Member,
  MembershipStatus,
  OrgRole,
} from '@/shared/api/organization-contracts.ts';
import {
  type OrgListKeyParams,
  orgQueryKeys,
} from '@/shared/api/organization-query-keys.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import {
  type CursorListResult,
  useCursorList,
} from '@/shared/hooks/useCursorList/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/** Server-side query params for the members list (search + sort). */
export type MembersListParams = OrgListKeyParams;

/**
 * Members of the active organization — windowed list query + role/status/removal
 * mutations. Server state only — never mirrored into Zustand (file-structure.mdc).
 * The list is cursor-paginated server-side (search `q`, sort, + `Load more`);
 * mutations patch every cached page optimistically via `optimisticInfinite`.
 */
export function useMembers(params: MembersListParams = {}): CursorListResult<Member> {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useCursorList<Member>({
    queryKey: orgQueryKeys.membersList(orgId, params),
    queryFn: (after) => orgApi.listMembers({ ...params, after }),
    // The members panel renders a RetryError for exactly this failure.
    notifyOnError: false,
    // No active org (mid org-switch, or before context resolves) → skip the
    // request instead of firing a `Forbidden` against an empty org scope.
    enabled: Boolean(orgId),
  });
}

/** Update a member's role with optimistic UI, then refresh the members list. */
export function useUpdateMemberRole() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (input: { membershipId: string; role: OrgRole; roleId?: string }) =>
      orgApi.updateMemberRole(input),
    invalidateKeys: [orgQueryKeys.members(orgId)],
    optimisticInfinite: {
      queryKey: orgQueryKeys.members(orgId),
      update: (rows: Member[], { membershipId, role }) =>
        rows.map((m) => (m.id === membershipId ? { ...m, role } : m)),
    },
    successMessage: i18n.t(ERRORS_KEYS.frontend.hooks.members.updateRoleSuccess, {
      ns: ERRORS_NS,
    }),
    notifyOnError: true,
  });
}

/** Remove a member — optimistically drops the row from the list. */
export function useRemoveMember(options?: { suppressSuccessToast?: boolean }) {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (membershipId: string) => orgApi.removeMember(membershipId),
    invalidateKeys: [orgQueryKeys.members(orgId)],
    optimisticInfinite: {
      queryKey: orgQueryKeys.members(orgId),
      update: (rows: Member[], membershipId) =>
        rows.filter((member) => member.id !== membershipId),
    },
    // Callers that run this behind the undo toast own the whole message
    // sequence; a second success toast five seconds after the first one is the
    // same removal reported twice (SET-7).
    successMessage: options?.suppressSuccessToast
      ? undefined
      : i18n.t(ERRORS_KEYS.frontend.hooks.members.removeSuccess, { ns: ERRORS_NS }),
  });
}

/** Suspend or reactivate a member — optimistically flips the status badge. */
export function useUpdateMemberStatus() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (input: { membershipId: string; status: MembershipStatus }) =>
      orgApi.updateMemberStatus(input),
    invalidateKeys: [orgQueryKeys.members(orgId)],
    optimisticInfinite: {
      queryKey: orgQueryKeys.members(orgId),
      update: (rows: Member[], { membershipId, status }) =>
        rows.map((member) =>
          member.id === membershipId ? { ...member, status } : member,
        ),
    },
    successMessage: (member) =>
      i18n.t(
        member.status === 'suspended'
          ? ERRORS_KEYS.frontend.hooks.members.suspendSuccess
          : ERRORS_KEYS.frontend.hooks.members.reactivateSuccess,
        { ns: ERRORS_NS },
      ),
  });
}
