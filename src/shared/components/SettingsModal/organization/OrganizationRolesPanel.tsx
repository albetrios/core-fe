import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listRefreshClass } from '@/lib/list-refresh.ts';
import { cn } from '@/lib/utils.ts';
import type { RoleSummary } from '@/shared/api/organization-contracts.ts';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog/index.ts';
import { CreateRoleDialog } from '@/shared/components/CreateRoleDialog/index.ts';
import { EmptyState } from '@/shared/components/EmptyState/index.ts';
import { RetryError } from '@/shared/components/RetryError/index.ts';
import {
  formatSettingsBreadcrumb,
  SETTINGS_GROUP_LABEL_KEYS,
  SETTINGS_KEYS,
  SETTINGS_NS,
  SETTINGS_SECTION_LABEL_KEYS,
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
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { useCan } from '@/shared/hooks/useCan/index.ts';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue/index.ts';
import { useDeleteRole, useRoles } from '@/shared/hooks/useRoles/index.ts';
import { MoreHorizontal, ShieldCheck } from '@/shared/icons/index.ts';
import { notifyDeferredCommit } from '@/shared/notify/notify-deferred.ts';

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
  return (
    <div className="space-y-2" data-testid="roles-loading">
      {['a', 'b', 'c'].map((key) => (
        <Skeleton key={key} className="h-14 w-full" />
      ))}
    </div>
  );
}

/** Loading / error / empty / list+load-more region for the roles list. */
function RolesResults({
  roles,
  isSearching,
  canManage,
  onEdit,
  onDelete,
}: {
  roles: ReturnType<typeof useRoles>;
  isSearching: boolean;
  canManage: boolean;
  onEdit: (role: RoleSummary) => void;
  onDelete: (role: RoleSummary) => void;
}) {
  const { t } = useTranslation(SETTINGS_NS);
  const panels = SETTINGS_KEYS.panels.roles;

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
        className={cn('gap-0 overflow-hidden py-0', listRefreshClass(roles.isRefreshing))}
        aria-busy={roles.isRefreshing}
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
  const debouncedSearch = useDebouncedValue(search.trim());
  const sortParams = orgListSortToParams(sort);
  const roles = useRoles({
    q: debouncedSearch || undefined,
    ...sortParams,
  });
  const canManage = useCan({ permission: 'role:manage', teamOrganizationOnly: true });
  const deleteRole = useDeleteRole();
  const [toDelete, setToDelete] = useState<RoleSummary | null>(null);
  const [toEdit, setToEdit] = useState<RoleSummary | null>(null);

  const panels = SETTINGS_KEYS.panels.roles;
  const breadcrumb = formatSettingsBreadcrumb(
    t(SETTINGS_GROUP_LABEL_KEYS.organization),
    t(SETTINGS_SECTION_LABEL_KEYS.roles),
  );
  const isSearching = debouncedSearch.length > 0;

  return (
    <section className="space-y-6" data-testid="settings-organization-roles">
      <SectionHeader
        breadcrumb={breadcrumb}
        title={t(panels.title)}
        description={t(panels.description)}
      />

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
        {canManage ? <CreateRoleDialog /> : null}
      </div>

      <RolesResults
        roles={roles}
        isSearching={isSearching}
        canManage={canManage}
        onEdit={setToEdit}
        onDelete={setToDelete}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title={t(panels.deleteTitle, { name: toDelete?.name ?? 'role' })}
        description={t(panels.deleteDescription)}
        confirmLabel={t(panels.deleteConfirm)}
        destructive
        onConfirm={() => {
          if (!toDelete) return;
          const role = toDelete;
          setToDelete(null);
          notifyDeferredCommit({
            pendingMessage: t(panels.deletePending, { name: role.name }),
            toastId: `delete-role-${role.id}`,
            onCommit: () => deleteRole.mutate(role.id),
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
