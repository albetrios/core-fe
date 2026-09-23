import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { isListStale, listRefreshClass } from '@/lib/list-refresh.ts';
import { cn } from '@/lib/utils.ts';
import type { RoleSummary } from '@/shared/api/organization-contracts.ts';
import { orgQueryKeys } from '@/shared/api/organization-query-keys.ts';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog/index.ts';
import { CreateRoleDialog } from '@/shared/components/CreateRoleDialog/index.ts';
import { EmptyState } from '@/shared/components/EmptyState/index.ts';
import { PanelSkeleton } from '@/shared/components/PanelSkeleton/index.ts';
import { RetryError } from '@/shared/components/RetryError/index.ts';
import {
  SETTINGS_KEYS,
  SETTINGS_NS,
} from '@/shared/components/SettingsModal/settings.constants.ts';
import { SectionHeader } from '@/shared/components/SettingsModal/SettingsPanelShell.tsx';
import { Badge } from '@/shared/components/ui/badge.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card } from '@/shared/components/ui/card.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu.tsx';
import { useAccessResolved, useCan } from '@/shared/hooks/useCan/index.ts';
import { useDebouncedSearch } from '@/shared/hooks/useDebouncedValue/index.ts';
import { useDeferredRowRemoval } from '@/shared/hooks/useDeferredRowRemoval/index.ts';
import { useDeleteRole, useRoles } from '@/shared/hooks/useRoles/index.ts';
import { MoreHorizontal, Plus, ShieldCheck } from '@/shared/icons/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import {
  DEFAULT_ORG_LIST_SORT,
  type OrgListSortPreset,
  orgListSortToParams,
} from './org-list-sort.ts';
import { OrgListControls } from './OrgListControls.tsx';

/** Per-role actions menu (custom roles only): edit or delete. */
function RoleRowActions({
  role,
  onEdit,
  onDelete,
}: {
  role: RoleSummary;
  onEdit: (role: RoleSummary) => void;
  onDelete: (role: RoleSummary) => void;
}) {
  const { t } = useTranslation(SETTINGS_NS);
  const panels = SETTINGS_KEYS.panels.roles;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(panels.actionsAria, { name: role.name })}
          data-testid={`role-actions-${role.id}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => onEdit(role)}
          data-testid={`role-edit-${role.id}`}
        >
          {t(panels.editAction)}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onDelete(role)}
          data-testid={`role-delete-${role.id}`}
        >
          {t(panels.deleteAction)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One role row: name, system badge, member count, and (for custom roles) actions. */
function RoleListItem({
  role,
  canManage,
  onEdit,
  onDelete,
}: {
  role: RoleSummary;
  canManage: boolean;
  onEdit: (role: RoleSummary) => void;
  onDelete: (role: RoleSummary) => void;
}) {
  const { t } = useTranslation(SETTINGS_NS);
  const panels = SETTINGS_KEYS.panels.roles;
  return (
    <li className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{role.name}</p>
          {role.isSystem ? (
            <Badge variant="outline">{t(panels.systemBadge)}</Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground truncate text-xs">{role.description}</p>
      </div>
      <span className="text-muted-foreground shrink-0 text-xs">
        {t(panels.memberCount, { count: role.memberCount })}
      </span>
      {canManage && !role.isSystem ? (
        <RoleRowActions role={role} onEdit={onEdit} onDelete={onDelete} />
      ) : null}
    </li>
  );
}

function RolesLoading() {
  return <PanelSkeleton testId="roles-loading" />;
}

/** Loading / error / empty / list+load-more region for the roles list. */
function RolesResults({
  roles,
  isSearching,
  isStale,
  canManage,
  onEdit,
  onDelete,
}: {
  roles: ReturnType<typeof useRoles>;
  isSearching: boolean;
  /** The rows answer a question the user has already changed. */
  isStale: boolean;
  canManage: boolean;
  onEdit: (role: RoleSummary) => void;
  onDelete: (role: RoleSummary) => void;
}) {
  const { t } = useTranslation(SETTINGS_NS);
  const panels = SETTINGS_KEYS.panels.roles;
  const stale = isListStale(roles.isRefreshing, isStale);

  if (roles.isPending) return <RolesLoading />;
  if (roles.isError) {
    return (
      <RetryError
        message={t(panels.loadFailed)}
        onRetry={roles.refetch}
        isRetrying={roles.isFetching}
      />
    );
  }
  if (roles.rows.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck />}
        title={isSearching ? t(panels.noResults) : t(panels.emptyTitle)}
        description={isSearching ? '' : t(panels.emptyDescription)}
      />
    );
  }
  return (
    <>
      <Card
        className={cn('gap-0 overflow-hidden py-0', listRefreshClass(stale))}
        aria-busy={stale}
      >
        <ul className="divide-border divide-y" data-testid="roles-list">
          {roles.rows.map((role) => (
            <RoleListItem
              key={role.id}
              role={role}
              canManage={canManage}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </Card>
      {roles.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={roles.fetchNextPage}
            disabled={roles.isFetchingNextPage}
            data-testid="roles-load-more"
          >
            {t(panels.loadMore)}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Roles panel — permission sets assignable to members. System roles are read-only;
 * custom roles can be deleted with undo-capable deferred commit.
 */
export function OrganizationRolesPanel() {
  const { t } = useTranslation(SETTINGS_NS);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<OrgListSortPreset>(DEFAULT_ORG_LIST_SORT);
  const { debounced: debouncedSearch, isPending: isSearchPending } =
    useDebouncedSearch(search);
  const sortParams = orgListSortToParams(sort);
  const roles = useRoles({
    q: debouncedSearch || undefined,
    ...sortParams,
  });
  const canManage = useCan({ permission: 'role:manage', teamOrganizationOnly: true });
  // See the members panel: a `false` before the guard chain answers is "not yet",
  // not "not allowed" (SET-23).
  const accessResolved = useAccessResolved();
  // See the members panel: the undo toast owns the message sequence, so the
  // mutation must not confirm the same deletion a second time (SET-7).
  const deleteRole = useDeleteRole({ suppressSuccessToast: true });
  const organizationId = useOrganizationStore((s) => s.organizationId);
  // Row leaves at schedule time; undo, a failed write, and an unmount inside
  // the window all put it back. See the members panel for the full rationale.
  const scheduleDeletion = useDeferredRowRemoval<RoleSummary>(
    orgQueryKeys.roles(organizationId),
  );
  const [toDelete, setToDelete] = useState<RoleSummary | null>(null);
  const [toEdit, setToEdit] = useState<RoleSummary | null>(null);

  const panels = SETTINGS_KEYS.panels.roles;
  const isSearching = debouncedSearch.length > 0;

  return (
    <section className="space-y-6" data-testid="settings-organization-roles">
      <SectionHeader title={t(panels.title)} description={t(panels.description)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <OrgListControls
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          searchPlaceholder={t(panels.searchPlaceholder)}
          searchTestId="roles-search"
          sortTestId="roles-sort"
        />
        {accessResolved ? null : (
          <Button size="sm" disabled data-testid="role-create-pending">
            <Plus className="me-2 h-4 w-4" />
            {t(panels.create)}
          </Button>
        )}
        {accessResolved && canManage ? <CreateRoleDialog /> : null}
      </div>

      <RolesResults
        roles={roles}
        isSearching={isSearching}
        isStale={isSearchPending}
        canManage={canManage}
        onEdit={setToEdit}
        onDelete={setToDelete}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title={t(panels.deleteTitle, {
          name: toDelete?.name ?? t(panels.roleFallback),
        })}
        description={t(panels.deleteDescription)}
        confirmLabel={t(panels.deleteConfirm)}
        destructive
        onConfirm={() => {
          if (!toDelete) return;
          const role = toDelete;
          setToDelete(null);
          scheduleDeletion({
            id: role.id,
            pendingMessage: t(panels.deletePending, { name: role.name }),
            committedMessage: i18n.t(ERRORS_KEYS.frontend.hooks.roles.deleteSuccess, {
              ns: ERRORS_NS,
            }),
            toastId: `delete-role-${role.id}`,
            // `mutateAsync`, never `mutate` — see the members panel: `mutate`
            // returns void, so nothing was awaited and nothing could reject.
            commit: () => deleteRole.mutateAsync(role.id),
          });
        }}
      />

      {toEdit ? (
        <CreateRoleDialog
          key={toEdit.id}
          role={toEdit}
          open
          onOpenChange={(open) => {
            if (!open) setToEdit(null);
          }}
        />
      ) : null}
    </section>
  );
}
