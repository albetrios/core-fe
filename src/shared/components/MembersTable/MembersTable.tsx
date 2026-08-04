import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { type Dispatch, type SetStateAction, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { downloadCsv, toCsv } from '@/lib/csv.ts';
import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import type { Member, OrgRole } from '@/shared/api/organization-contracts.ts';
import { DataTable } from '@/shared/components/DataTable/index.ts';
import { DataTableColumnHeader } from '@/shared/components/DataTableColumnHeader/index.ts';
import { DataTablePagination } from '@/shared/components/DataTablePagination/index.ts';
import { DataTableToolbar } from '@/shared/components/DataTableToolbar/index.ts';
import { FormattedDate } from '@/shared/components/FormattedDate/index.ts';
import { InviteMemberDialog } from '@/shared/components/InviteMemberDialog/index.ts';
import {
  MemberStatusBadge,
  RoleBadge,
} from '@/shared/components/OrganizationBadges/index.ts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog.tsx';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card } from '@/shared/components/ui/card.tsx';
import { Checkbox } from '@/shared/components/ui/checkbox.tsx';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select.tsx';
import { useDataTableUrlState } from '@/shared/hooks/useDataTableUrlState/index.ts';
import {
  useRemoveMember,
  useUpdateMemberRole,
  useUpdateMemberStatus,
} from '@/shared/hooks/useMembers/index.ts';
import { useHasPermission } from '@/shared/hooks/useRBAC/index.ts';
import { Download, MoreHorizontal } from '@/shared/icons/index.ts';

import { MEMBERS_TABLE_KEYS, MEMBERS_TABLE_NS } from './members-table.constants.ts';

function applyStateUpdate<T>(updater: SetStateAction<T>, prev: T): T {
  return typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
}

const ASSIGNABLE_ROLES: OrgRole[] = ['owner', 'admin', 'member', 'viewer'];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('');
}

function RowActions({ member, canManage }: { member: Member; canManage: boolean }) {
  const { t } = useTranslation(MEMBERS_TABLE_NS);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const updateRole = useUpdateMemberRole();
  const updateStatus = useUpdateMemberStatus();
  const removeMember = useRemoveMember();

  if (!canManage) {
    return null;
  }

  const isSuspended = member.status === 'suspended';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t(MEMBERS_TABLE_KEYS.actionsAria, { name: member.name })}
            data-testid={`member-actions-${member.id}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t(MEMBERS_TABLE_KEYS.changeRole)}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={member.role}
            onValueChange={(role) =>
              updateRole.mutate({ membershipId: member.id, role: role as OrgRole })
            }
          >
            {ASSIGNABLE_ROLES.map((role) => (
              <DropdownMenuRadioItem key={role} value={role} className="capitalize">
                {role}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              updateStatus.mutate({
                membershipId: member.id,
                status: isSuspended ? 'active' : 'suspended',
              })
            }
            data-testid={`member-toggle-status-${member.id}`}
          >
            {isSuspended
              ? t(MEMBERS_TABLE_KEYS.reactivate)
              : t(MEMBERS_TABLE_KEYS.suspend)}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
            {t(MEMBERS_TABLE_KEYS.remove)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(MEMBERS_TABLE_KEYS.removeTitle, { name: member.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(MEMBERS_TABLE_KEYS.removeDescription)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(MEMBERS_TABLE_KEYS.cancel)}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeMember.mutate(member.id)}
              data-testid={`member-remove-confirm-${member.id}`}
            >
              {t(MEMBERS_TABLE_KEYS.confirmRemove)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function buildColumns(
  canManage: boolean,
  tCommon: (key: string) => string,
): ColumnDef<Member>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={tCommon(LOCALE_KEYS.selectAll)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.name}`}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Member" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {initials(row.original.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.original.name}</p>
            <p className="text-muted-foreground truncate text-xs">{row.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
      filterFn: (row, id, value: string) => value === 'all' || row.getValue(id) === value,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <MemberStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'joinedAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          <FormattedDate
            value={row.original.joinedAt}
            className="text-muted-foreground text-sm"
          />
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => <RowActions member={row.original} canManage={canManage} />,
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

/**
 * Feature-rich members table: search, role filter, column sort/visibility, row
 * selection, pagination, CSV export, and permission-gated row actions + invite.
 *
 * @param props.members - The members to display.
 * @param props.syncUrl - When true, sync filter/sort/pagination to dashboard URL search params.
 */
export function MembersTable({
  members,
  syncUrl = false,
}: {
  members: Member[];
  syncUrl?: boolean;
}) {
  const { t: tCommon } = useTranslation(LOCALE_NS);
  const canManage = useHasPermission('membership:manage');
  const url = useDataTableUrlState(syncUrl);
  const [sorting, setSorting] = useState<SortingState>(url.initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    url.initialFilters,
  );
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [pagination, setPagination] = useState({
    pageIndex: url.initialPageIndex,
    pageSize: url.initialPageSize,
  });

  const columns = useMemo(() => buildColumns(canManage, tCommon), [canManage, tCommon]);

  const onSortingChange: Dispatch<SetStateAction<SortingState>> = (updater) => {
    setSorting((prev) => {
      const next = applyStateUpdate(updater, prev);
      url.onSortingChange(next);
      return next;
    });
  };

  const onColumnFiltersChange: Dispatch<SetStateAction<ColumnFiltersState>> = (
    updater,
  ) => {
    setColumnFilters((prev) => {
      const next = applyStateUpdate(updater, prev);
      url.onFiltersChange(next);
      return next;
    });
  };

  const onPaginationChange: Dispatch<
    SetStateAction<{ pageIndex: number; pageSize: number }>
  > = (updater) => {
    setPagination((prev) => {
      const next = applyStateUpdate(updater, prev);
      url.onPaginationChange(next.pageIndex, next.pageSize);
      return next;
    });
  };

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns non-memoizable functions by design
  const table = useReactTable({
    data: members,
    columns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, pagination },
    enableRowSelection: true,
    onSortingChange,
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const roleFilter = (table.getColumn('role')?.getFilterValue() as string) ?? 'all';

  const handleExport = () => {
    const selected = table.getFilteredSelectedRowModel().rows;
    const source = selected.length > 0 ? selected : table.getFilteredRowModel().rows;
    const rows = source.map((r) => [
      r.original.name,
      r.original.email,
      r.original.role,
      r.original.status,
      r.original.joinedAt,
    ]);
    downloadCsv(
      'members.csv',
      toCsv(['Name', 'Email', 'Role', 'Status', 'Joined'], rows),
    );
  };

  return (
    <div className="space-y-4" data-testid="members-table">
      <DataTableToolbar
        table={table}
        searchColumnId="name"
        searchPlaceholder="Search members…"
      >
        <Select
          value={roleFilter}
          onValueChange={(value) =>
            table.getColumn('role')?.setFilterValue(value === 'all' ? undefined : value)
          }
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-[130px]"
            data-testid="members-role-filter"
          >
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ASSIGNABLE_ROLES.map((role) => (
              <SelectItem key={role} value={role} className="capitalize">
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={handleExport}
          data-testid="members-export"
        >
          <Download className="me-2 h-4 w-4" />
          Export
        </Button>
        {canManage && <InviteMemberDialog />}
      </DataTableToolbar>

      <Card className="gap-0 overflow-hidden py-0">
        <DataTable table={table} emptyMessage="No members found." />
      </Card>

      <DataTablePagination table={table} />
    </div>
  );
}
