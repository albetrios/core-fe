import { type ColumnFiltersState, useTable } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { dataTableFeatures } from '@/shared/components/DataTable/index.ts';

import { DataTableToolbar } from './DataTableToolbar.tsx';

/**
 * A table wired the way the real ones are: filter state lives in the parent and
 * is fed back in, so `table.state.columnFilters` changes while the table
 * INSTANCE keeps its identity. That is exactly the shape a `useMemo(..., [table])`
 * cannot see.
 */
function Harness() {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const table = useTable({
    features: dataTableFeatures,
    data: [{ name: 'Ada' }, { name: 'Grace' }],
    columns: [{ accessorKey: 'name', header: 'Name' }],
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
  });
  return (
    <>
      <DataTableToolbar table={table} searchColumnId="name" />
      <ul data-testid="rows">
        {table.getRowModel().rows.map((row) => (
          <li key={row.id}>{row.getValue('name') as string}</li>
        ))}
      </ul>
    </>
  );
}

describe('DataTableToolbar', () => {
  it('renders the bound search input', () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  // ── SET-5: the toolbar must read the table's LIVE state ───────────────────

  it('keeps what the user typed in the search box', async () => {
    // Regression: `searchValue` was memoised on `[searchColumn]`, whose identity
    // never changes, so the controlled input was pinned to '' — the rows
    // filtered while every character vanished from the box as it was typed.
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByPlaceholderText('Search...');

    await user.type(input, 'Grace');

    expect(input).toHaveValue('Grace');
    expect(screen.getByTestId('rows')).toHaveTextContent('Grace');
    expect(screen.getByTestId('rows')).not.toHaveTextContent('Ada');
  });

  it('shows Reset once a filter is active, and clears it', async () => {
    // Regression: `isFiltered` was memoised on `[table]` — frozen `false` at
    // mount, so the Reset button never appeared however much was filtered.
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search...'), 'Grace');

    const reset = await screen.findByRole('button', { name: /reset/i });
    await user.click(reset);

    expect(screen.getByPlaceholderText('Search...')).toHaveValue('');
    expect(screen.getByTestId('rows')).toHaveTextContent('Ada');
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
  });
});
