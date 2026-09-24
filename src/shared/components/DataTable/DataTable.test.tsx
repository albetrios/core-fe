import { type ColumnDef, useTable } from '@tanstack/react-table';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DataTableColumnHeader } from '@/shared/components/DataTableColumnHeader/index.ts';
import { DataTablePagination } from '@/shared/components/DataTablePagination/index.ts';
import { DataTableToolbar } from '@/shared/components/DataTableToolbar/index.ts';
import { Checkbox } from '@/shared/components/ui/checkbox.tsx';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { DataTable } from './DataTable.tsx';
import { type DataTableFeatures, dataTableFeatures } from './table-features.ts';

const COLUMNS = [{ accessorKey: 'name', header: 'Name' }];
const DATA = [{ name: 'Ada' }, { name: 'Grace' }];

function Harness() {
  const table = useTable({
    features: dataTableFeatures,
    data: DATA,
    columns: COLUMNS,
  });
  return <DataTable table={table} />;
}

describe('DataTable', () => {
  it('renders header and rows from the table instance', () => {
    render(<Harness />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Grace')).toBeInTheDocument();
  });
});

interface Person {
  name: string;
  joinedAt: string;
}

function person(index: number, joinedAt = '2025-01-12T09:00:00.000Z'): Person {
  // Zero-padded so lexicographic order matches numeric order, letting the
  // sorting assertions name an exact expected first row.
  return { name: `Person ${String(index).padStart(2, '0')}`, joinedAt };
}

const KIT_COLUMNS: ColumnDef<DataTableFeatures, Person>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
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
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  },
  {
    accessorKey: 'joinedAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
  },
];

/** The whole kit, wired the way a list page wires it: toolbar, table, pagination. */
function KitHarness({ data }: Readonly<{ data: Person[] }>) {
  const table = useTable({ features: dataTableFeatures, data, columns: KIT_COLUMNS });
  return (
    <>
      <DataTableToolbar
        table={table}
        searchColumnId="name"
        searchPlaceholder="Search people"
      />
      <DataTable table={table} />
      <DataTablePagination table={table} />
    </>
  );
}

/** Render the kit and wait for it: the providers mount asynchronously. */
async function renderKit(data: Person[]) {
  renderWithProviders(<KitHarness data={data} />);
  await screen.findByPlaceholderText('Search people');
}

/** Row names in render order, excluding the header row. */
function renderedNames(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).queryByText(/^Person \d\d$/)?.textContent ?? '')
    .filter(Boolean);
}

// TanStack Table v9 makes every feature opt-in via the shared `dataTableFeatures`
// set. A feature omitted there still type-checks at the call site but dies at
// runtime, so each registered feature is exercised through the kit's UI rather
// than asserted structurally.
describe('DataTable kit features', () => {
  it('sorts rows when a column header sort action is chosen', async () => {
    const user = userEvent.setup();
    await renderKit([person(1), person(2), person(3)]);
    expect(renderedNames()[0]).toBe('Person 01');

    await user.click(screen.getByRole('button', { name: /^name/i }));
    await user.click(await screen.findByRole('menuitem', { name: /desc/i }));

    expect(renderedNames()[0]).toBe('Person 03');
  });

  it('sorts a column of ISO timestamps, which resolves a different comparator', async () => {
    const user = userEvent.setup();
    await renderKit([
      person(1, '2025-03-01T09:00:00.000Z'),
      person(2, '2025-01-01T09:00:00.000Z'),
      person(3, '2025-02-01T09:00:00.000Z'),
    ]);

    await user.click(screen.getByRole('button', { name: /^joined/i }));
    await user.click(await screen.findByRole('menuitem', { name: /asc/i }));

    expect(renderedNames()).toEqual(['Person 02', 'Person 03', 'Person 01']);
  });

  // The one comparator `table-features.ts` registers: the toolbar's search column
  // resolves to `includesString`, and dropping it silently stops filtering.
  it('filters rows through the toolbar search input', async () => {
    const user = userEvent.setup();
    await renderKit([person(1), person(2), person(3)]);
    expect(renderedNames()).toHaveLength(3);

    await user.type(screen.getByPlaceholderText('Search people'), 'Person 02');

    expect(renderedNames()).toEqual(['Person 02']);
  });

  it('paginates when rows exceed the default page size', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) => person(i + 1));
    await renderKit(many);

    // Default page size is 10, so 12 rows split 10 + 2.
    expect(renderedNames()).toHaveLength(10);
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next page/i }));

    expect(renderedNames()).toEqual(['Person 11', 'Person 12']);
  });

  it('tracks row selection from the select-all checkbox', async () => {
    const user = userEvent.setup();
    await renderKit([person(1), person(2)]);

    await user.click(screen.getByRole('checkbox', { name: /select all/i }));

    expect(screen.getByText(/2 of 2 row\(s\) selected/i)).toBeInTheDocument();
  });
});
