import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import * as orgApi from '@/shared/api/organization-api.ts';
import type { Member } from '@/shared/api/organization-contracts.ts';
import { orgQueryKeys } from '@/shared/api/organization-query-keys.ts';
import { useAppMutation } from '@/shared/hooks/useAppMutation/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/**
 * Invite a member by email. core-be models an invitation as an INVITED
 * membership (`POST /organization/memberships`), so the new invitee lands in
 * the MEMBERS list — invalidate that, not a separate invitations list. Resend
 * and revoke act on the invitation that INVITED row carries (below).
 */
export function useInviteMember() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (input: { email: string; roleId: string }) => orgApi.inviteMember(input),
    invalidateKeys: [orgQueryKeys.members(orgId)],
    successMessage: (member) =>
      i18n.t(ERRORS_KEYS.frontend.hooks.invitations.sendSuccess, {
        ns: ERRORS_NS,
        email: member.email,
      }),
  });
}

/**
 * Send a pending invitation again, then refresh the members list so the row
 * shows its new expiry.
 *
 * @remarks
 * A refusal (expired, already accepted, rate-limited) surfaces through the
 * mutation's default error toast, with core-be's own reason.
 */
export function useResendInvitation() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (invitationId: string) => orgApi.resendInvitation(invitationId),
    invalidateKeys: [orgQueryKeys.members(orgId)],
    successMessage: (result) =>
      i18n.t(ERRORS_KEYS.frontend.hooks.invitations.resendSuccess, {
        ns: ERRORS_NS,
        email: result.email,
      }),
  });
}

/**
 * Revoke a pending invitation. core-be removes the invited membership with it,
 * so the row leaves the list: optimistically here, then for real on refresh.
 *
 * @remarks
 * Callers that run this behind the undo toast own the whole message sequence,
 * so they pass `suppressSuccessToast` (the same contract as `useRemoveMember`).
 */
export function useRevokeInvitation(options?: { suppressSuccessToast?: boolean }) {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (invitationId: string) => orgApi.revokeInvitation(invitationId),
    invalidateKeys: [orgQueryKeys.members(orgId)],
    optimisticInfinite: {
      queryKey: orgQueryKeys.members(orgId),
      update: (rows: Member[], invitationId) =>
        rows.filter((member) => member.invitation?.id !== invitationId),
    },
    successMessage: options?.suppressSuccessToast
      ? undefined
      : i18n.t(ERRORS_KEYS.frontend.hooks.invitations.cancelSuccess, { ns: ERRORS_NS }),
  });
}
