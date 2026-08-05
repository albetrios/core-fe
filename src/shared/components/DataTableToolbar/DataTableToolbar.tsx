import type { Table } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { TABLE_KEYS } from '@/shared/components/DataTableToolbar/data-table.constants.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { Search, SlidersHorizontal, X } from '@/shared/icons/index.ts';

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  /** Column id to bind the global search/filter input to. */
  searchColumnId?: string;
  /** Placeholder for the search input. */
  searchPlaceholder?: string;
  /** Extra controls rendered to the right of search (e.g. filter buttons). */
  children?: React.ReactNode;
}

export function DataTableToolbar<TData>({
  table,
  searchColumnId,
  searchPlaceholder,
  children,
}: DataTableToolbarProps<TData>) {
  const { t } = useTranslation(LOCALE_NS);
  const isFiltered = useMemo(() => table.getState().columnFilters.length > 0, [table]);

  const searchColumn = useMemo(
    () => (searchColumnId ? table.getColumn(searchColumnId) : undefined),
    [table, searchColumnId],
  );

  const searchValue = useMemo(
    () => (searchColumn?.getFilterValue() as string) ?? '',
    [searchColumn],
  );

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {/* Search input */}
        {searchColumn && (
          <div className="relative w-full max-w-sm">
            <Search className="text-muted-foreground absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder={searchPlaceholder ?? t(TABLE_KEYS.searchPlaceholder)}
              value={searchValue}
              onChange={(e) => searchColumn.setFilterValue(e.target.value)}
              className="h-8 ps-9"
            />
          </div>
        )}

        {/* Extra filter controls from consumer */}
        {children}

        {/* Clear filters */}
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X />
          </Button>
        )}
      </div>

      {/* Column visibility toggle */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="ms-auto hidden h-8 lg:flex">
            <SlidersHorizontal className="me-2 h-4 w-4" />
            View
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[150px]">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {table
            .getAllColumns()
            .filter(
              (column) => typeof column.accessorFn !== 'undefined' && column.getCanHide(),
            )
            .map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {column.id}
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
