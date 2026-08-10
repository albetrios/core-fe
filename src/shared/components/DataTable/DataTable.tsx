import { flexRender, type ReactTable, type RowData } from '@tanstack/react-table';
import { memo } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table.tsx';

import type { DataTableFeatures } from './table-features.ts';

interface DataTableProps<TData extends RowData> {
  table: ReactTable<DataTableFeatures, TData>;
  /** Message shown when the table has no rows. */
  emptyMessage?: string;
}

/**
 * Generic data-table renderer powered by TanStack Table.
 *
 * Usage:
 * ```tsx
 * const table = useTable({ features: dataTableFeatures, data, columns, ... });
 * <DataTable table={table} />
 * ```
 */
function DataTableInner<TData extends RowData>({
  table,
  emptyMessage = 'No results.',
}: DataTableProps<TData>) {
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              // aria-sort is only valid on the columnheader (<th>) itself,
              // not on the sort-menu trigger button inside it.
              const sorted = header.column.getIsSorted();
              let ariaSort: 'ascending' | 'descending' | 'none' | undefined;
              if (header.column.getCanSort()) {
                ariaSort = 'none';
                if (sorted === 'asc') ariaSort = 'ascending';
                else if (sorted === 'desc') ariaSort = 'descending';
              }
              return (
                <TableHead key={header.id} colSpan={header.colSpan} aria-sort={ariaSort}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length > 0 ? (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={table.getAllColumns().length}
              className="text-muted-foreground h-24 text-center"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// memo wrapper preserving the generic type parameter.
// NOTE: Biome's linter is disabled for this file via an override in biome.json — Biome 2.5.4
// panics ("index out of bounds") while building the semantic model for `memo(<generic
// component>)`, an upstream bug (https://github.com/biomejs/biome/issues), not a code defect.
// ESLint still fully lints this file; remove the biome.json override once the upstream fix lands.
export const DataTable = memo(DataTableInner) as typeof DataTableInner;
