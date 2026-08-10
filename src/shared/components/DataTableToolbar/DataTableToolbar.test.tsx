import { useTable } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { dataTableFeatures } from '@/shared/components/DataTable/index.ts';

import { DataTableToolbar } from './DataTableToolbar.tsx';

function Harness() {
  const table = useTable({
    features: dataTableFeatures,
    data: [{ name: 'Ada' }],
    columns: [{ accessorKey: 'name', header: 'Name' }],
  });
  return <DataTableToolbar table={table} searchColumnId="name" />;
}

describe('DataTableToolbar', () => {
  it('renders the bound search input', () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });
});
