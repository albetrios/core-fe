import { useTable } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { dataTableFeatures } from '@/shared/components/DataTable/index.ts';

import { DataTablePagination } from './DataTablePagination.tsx';

function Harness() {
  const table = useTable({
    features: dataTableFeatures,
    data: [{ name: 'Ada' }, { name: 'Grace' }],
    columns: [{ accessorKey: 'name', header: 'Name' }],
  });
  return <DataTablePagination table={table} />;
}

describe('DataTablePagination', () => {
  it('renders the pagination controls', () => {
    render(<Harness />);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(4);
  });
});
