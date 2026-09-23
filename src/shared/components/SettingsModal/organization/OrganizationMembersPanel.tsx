import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { isListStale, listRefreshClass } from '@/lib/list-refresh.ts';
import { cn } from '@/lib/utils.ts';
import type { Member, OrgRole } from '@/shared/api/organization-contracts.ts';
import { orgQueryKeys } from '@/shared/api/organization-query-keys.ts';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog/index.ts';
import { EmptyState } from '@/shared/components/EmptyState/index.ts';
import { InviteMemberDialog } from '@/shared/components/InviteMemberDialog/index.ts';
import { PanelSkeleton } from '@/shared/components/PanelSkeleton/index.ts';
import { RetryError } from '@/shared/components/RetryError/index.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { SectionHeader } from '@/shared/components/SettingsModal/SettingsPanelShell.tsx';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar.tsx';
import { Badge } from '@/shared/components/ui/badge.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card } from '@/shared/components/ui/card.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { useAccessResolved, useCan } from '@/shared/hooks/useCan/index.ts';
import { useDebouncedSearch } from '@/shared/hooks/useDebouncedValue/index.ts';
import { useDeferredRowRemoval } from '@/shared/hooks/useDeferredRowRemoval/index.ts';
import {
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
  useUpdateMemberStatus,
} from '@/shared/hooks/useMembers/index.ts';
import { useRoles } from '@/shared/hooks/useRoles/index.ts';
import { Loader, MoreHorizontal, UserPlus, Users } from '@/shared/icons/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import {
  DEFAULT_ORG_LIST_SORT,
  type OrgListSortPreset,
  orgListSortToParams,
} from './org-list-sort.ts';
import { OrgListControls } from './OrgListControls.tsx';

function initials(name: string): string {
  const letters = name
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return letters || '?';
}

function statusVariant(
  status: Member['status'],
): 'secondary' | 'destructive' | 'outline' {
  if (status === 'suspended') return 'destructive';
  if (status === 'invited') return 'outline';
  return 'secondary';
}

function MembersLoading() {
  return <PanelSkeleton testId="members-loading" />;
}

/** Best-effort map of a role's display name to the coarse OrgRole (optimistic label only). */
function toOrgRoleName(name: string): OrgRole {
  const n = name.toLowerCase();
  return n === 'owner' || n === 'admin' || n === 'viewer' ? n : 'member';
}

/**
 * Per-member management menu (gated by the caller on `membership:manage`):
 * change role — to any of the org's real non-owner roles — suspend/reactivate,
 * and remove. The owner's own row shows no actions (an org can't manage its
 * owner from here).
 */
function MemberRowActions({
  member,
  onRemove,
}: {
  member: Member;
  onRemove: (member: Member) => void;
}) {
  const { t } = useTranslation(SETTINGS_NS);
  const panels = SETTINGS_KEYS.panels.members;
  const roles = useRoles();
  const updateRole = useUpdateMemberRole();
  const updateStatus = useUpdateMemberStatus();

  // Exclude the system roles by their flag, not by matching the name "owner" — a custom role
  // called "Owners" slipped straight through that string compare. This is UI robustness only;
  // core-be runs the real guard (`assertCallerCanGrantPermissionCodes` on membership create
  // and update refuses any role carrying a code the caller does not hold).
  const assignableRoles = (roles.rows ?? []).filter((role) => !role.isSystem);
  const isSuspended = member.status === 'suspended';
  /**
   * One membership write at a time. The menu is still clickable while a change
   * is in flight, and `useAppMutation` JOINS a second call to the first - so
   * the second pick looked accepted and then vanished. Disable it (SET-12).
   */
  const isWriting = updateRole.isPending || updateStatus.isPending;
  // Suspend/reactivate only applies once a member has actually joined — core-be
  // rejects flipping a never-joined (invited) membership to active. Invited
  // members get role-change + remove (which revokes the invite).
  const hasJoined = member.joinedAt !== '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(panels.actionsAria, { name: member.name })}
          data-testid={`member-actions-${member.id}`}
          aria-busy={isWriting}
        >
          {/* Radix closes the menu on select, so the disabled items are out of
              sight while the write runs. The row keeps the busy state visible. */}
          {isWriting ? (
            <Loader className="size-4 animate-spin" aria-hidden />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {assignableRoles.length > 0 ? (
          <>
            <DropdownMenuLabel>{t(panels.changeRole)}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={member.roleId}
              onValueChange={(roleId) => {
                // Radix fires this for the already-selected item too - re-picking
                // the member's current role is not a change, and used to send a
                // PATCH and toast "Role updated" for nothing.
                if (isWriting || roleId === member.roleId) return;
                const role = assignableRoles.find((r) => r.id === roleId);
                if (role) {
                  updateRole.mutate({
                    membershipId: member.id,
                    role: toOrgRoleName(role.name),
                    roleId: role.id,
                  });
                }
              }}
            >
              {assignableRoles.map((role) => (
                <DropdownMenuRadioItem
                  key={role.id}
                  value={role.id}
                  disabled={isWriting}
                  data-testid={`member-set-role-${role.id}`}
                >
                  {role.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {hasJoined ? (
          <DropdownMenuItem
            disabled={isWriting}
            onSelect={() =>
              updateStatus.mutate({
                membershipId: member.id,
                status: isSuspended ? 'active' : 'suspended',
              })
            }
            data-testid={`member-toggle-status-${member.id}`}
          >
            {isSuspended ? t(panels.reactivate) : t(panels.suspend)}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onRemove(member)}
          data-testid={`member-remove-${member.id}`}
        >
          {t(panels.removeAction)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Whether this caller can complete an invite, which takes two grants rather than one.
 *
 * Invite calls `POST /tenancy/organization/memberships`, gated on `membership:manage` —
 * NOT `invitation:manage`, which guards only the resend/revoke routes this client never
 * calls, so gating on it showed the button to a caller the API answers with 403. The dialog
 * also has to list roles to pick one (`GET .../roles`, `role:read`); without that the picker
 * renders empty and the invite cannot be finished, so offering the trigger would be a dead end.
 */
function useCanInviteMembers(): boolean {
  const canManageMembers = useCan({
    permission: 'membership:manage',
    teamOrganizationOnly: true,
  });
  const canReadRoles = useCan({ permission: 'role:read' });
  return canManageMembers && canReadRoles;
}

/**
 * Members panel — the active organization's people. Lists members with their
 * role + status; removal is gated on the membership:manage permission (team
 * orgs only) and confirmed via undo-capable deferred commit.
 */
export function OrganizationMembersPanel() {
  const { t } = useTranslation(SETTINGS_NS);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<OrgListSortPreset>(DEFAULT_ORG_LIST_SORT);
  const { debounced: debouncedSearch, isPending: isSearchPending } =
    useDebouncedSearch(search);
  const sortParams = orgListSortToParams(sort);
  const members = useMembers({
    q: debouncedSearch || undefined,
    ...sortParams,
  });
  const canManage = useCan({
    permission: 'membership:manage',
    teamOrganizationOnly: true,
  });
  const canInvite = useCanInviteMembers();
  /**
   * `useCan` is synchronous and the guard chain fills the permission set a beat
   * after this panel first renders, so a `false` here can mean "not yet". A
   * disabled placeholder of the same size holds the slot instead of leaving a
   * gap that fills itself a moment later (SET-23).
   */
  const accessResolved = useAccessResolved();
  /**
   * The undo toast owns the whole message sequence for a deferred removal
   * ("Removing Jo…" → "Member removed"), so the mutation must stay quiet —
   * otherwise one removal is confirmed twice, five seconds apart (SET-7).
   */
  const removeMember = useRemoveMember({ suppressSuccessToast: true });
  const organizationId = useOrganizationStore((s) => s.organizationId);
  /**
   * Removal runs through the shared row-removal hook rather than the raw
   * `notifyDeferredCommit`: the row has to leave the list at SCHEDULE time (the
   * mutation's own optimistic patch is five seconds away, so the toast used to
   * say "Removing Jo…" while Jo sat in the table), undo and a failed write both
   * have to put that row back, and an unmount inside the undo window has to
   * cancel the pending write instead of leaking a timer at a dead panel.
   */
  const scheduleRemoval = useDeferredRowRemoval<Member>(
    orgQueryKeys.members(organizationId),
  );
  const [toRemove, setToRemove] = useState<Member | null>(null);

  const panels = SETTINGS_KEYS.panels.members;
  const isSearching = debouncedSearch.length > 0;
  const isStale = isListStale(members.isRefreshing, isSearchPending);

  return (
    <section className="space-y-6" data-testid="settings-organization-members">
      <SectionHeader title={t(panels.title)} description={t(panels.description)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <OrgListControls
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          searchPlaceholder={t(panels.searchPlaceholder)}
          searchTestId="members-search"
          sortTestId="members-sort"
        />
        {accessResolved ? null : (
          <Button size="sm" disabled data-testid="invite-member-pending">
            <UserPlus className="me-2 h-4 w-4" />
            {t(panels.invite)}
          </Button>
        )}
        {accessResolved && canInvite ? <InviteMemberDialog /> : null}
      </div>

      {members.isPending ? <MembersLoading /> : null}

      {members.isError ? (
        <RetryError
          message={t(panels.loadFailed)}
          onRetry={members.refetch}
          isRetrying={members.isFetching}
        />
      ) : null}

      {!(members.isPending || members.isError) && members.rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={isSearching ? t(panels.noResults) : t(panels.emptyTitle)}
          description={isSearching ? '' : t(panels.emptyDescription)}
        />
      ) : null}

      {!members.isError && members.rows.length > 0 ? (
        <>
          <Card
            className={cn('gap-0 overflow-hidden py-0', listRefreshClass(isStale))}
            aria-busy={isStale}
          >
            <ul className="divide-border divide-y" data-testid="members-list">
              {members.rows.map((member) => (
                <li key={member.id} className="flex items-center gap-3 p-3">
                  <Avatar className="size-9">
                    <AvatarFallback className="text-xs">
                      {initials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{member.name}</p>
                    {member.email !== member.name ? (
                      <p className="text-muted-foreground truncate text-xs">
                        {member.email}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant="secondary" className="hidden capitalize sm:inline-flex">
                    {member.roleName}
                  </Badge>
                  <Badge variant={statusVariant(member.status)} className="capitalize">
                    {member.status}
                  </Badge>
                  {canManage && member.role !== 'owner' ? (
                    // One row's menu is its own failure domain - a member with
                    // malformed data must not blank the whole list.
                    <SectionErrorBoundary
                      variant="inline"
                      title={member.name}
                      testId={`member-actions-error-${member.id}`}
                    >
                      <MemberRowActions member={member} onRemove={setToRemove} />
                    </SectionErrorBoundary>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
          {members.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={members.fetchNextPage}
                disabled={members.isFetchingNextPage}
                data-testid="members-load-more"
              >
                {t(panels.loadMore)}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => {
          if (!open) setToRemove(null);
        }}
        title={t(panels.removeTitle, {
          name: toRemove?.name ?? t(panels.memberFallback),
        })}
        description={t(panels.removeDescription)}
        confirmLabel={t(panels.removeConfirm)}
        destructive
        onConfirm={() => {
          if (!toRemove) return;
          const member = toRemove;
          setToRemove(null);
          scheduleRemoval({
            id: member.id,
            pendingMessage: t(panels.removePending, { name: member.name }),
            // The copy the mutation would have toasted, handed to the undo
            // toast so the whole sequence lands on one toast id.
            committedMessage: i18n.t(ERRORS_KEYS.frontend.hooks.members.removeSuccess, {
              ns: ERRORS_NS,
            }),
            toastId: `remove-member-${member.id}`,
            // `mutateAsync`, never `mutate`: the deferred commit has to AWAIT
            // the DELETE. `mutate` returns void, so the toast reported success
            // before the request landed and a rejection could never reach
            // `onCommitError` — the row stayed gone after a failed delete.
            commit: () => removeMember.mutateAsync(member.id),
          });
        }}
      />
    </section>
  );
}
