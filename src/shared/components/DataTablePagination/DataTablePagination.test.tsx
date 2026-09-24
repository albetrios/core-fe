import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTablePagination } from './DataTablePagination.tsx';

type FakeTable = Parameters<typeof DataTablePagination>[0]['table'];

function fakeTable(overrides: {
  pageIndex?: number;
  pageSize?: number;
  pageCount?: number;
  selectedRows?: number;
  totalRows?: number;
}) {
  const {
    pageIndex = 0,
    pageSize = 10,
    pageCount = 5,
    selectedRows = 0,
    totalRows = 42,
  } = overrides;
  return {
    state: { pagination: { pageIndex, pageSize } },
    getFilteredSelectedRowModel: () => ({ rows: Array(selectedRows).fill({}) }),
    getFilteredRowModel: () => ({ rows: Array(totalRows).fill({}) }),
    getPageCount: () => pageCount,
    getCanPreviousPage: () => pageIndex > 0,
    getCanNextPage: () => pageIndex < pageCount - 1,
    setPageIndex: vi.fn(),
    previousPage: vi.fn(),
    nextPage: vi.fn(),
    setPageSize: vi.fn(),
  } as unknown as FakeTable;
}

describe('DataTablePagination', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows the selected-rows summary only when rows are selected', () => {
    const { rerender } = render(<DataTablePagination table={fakeTable({})} />);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();

    rerender(<DataTablePagination table={fakeTable({ selectedRows: 3 })} />);
    expect(screen.getByText('3 of 42 row(s) selected')).toBeInTheDocument();
  });

  it('renders the current page position', () => {
    render(<DataTablePagination table={fakeTable({ pageIndex: 2, pageCount: 5 })} />);
    expect(screen.getByText('Page 3 of 5')).toBeInTheDocument();
  });

  it('disables backward controls on the first page and forward on the last', () => {
    const { rerender } = render(
      <DataTablePagination table={fakeTable({ pageIndex: 0, pageCount: 3 })} />,
    );
    const [first, prev, next, last] = screen.getAllByRole('button');
    expect(first).toBeDisabled();
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();
    expect(last).toBeEnabled();

    rerender(<DataTablePagination table={fakeTable({ pageIndex: 2, pageCount: 3 })} />);
    const [first2, prev2, next2, last2] = screen.getAllByRole('button');
    expect(first2).toBeEnabled();
    expect(prev2).toBeEnabled();
    expect(next2).toBeDisabled();
    expect(last2).toBeDisabled();
  });

  it('wires each control to the matching table action', () => {
    const table = fakeTable({ pageIndex: 1, pageCount: 4 });
    render(<DataTablePagination table={table} />);
    const [first, prev, next, last] = screen.getAllByRole('button');

    fireEvent.click(first!);
    expect(table.setPageIndex).toHaveBeenCalledWith(0);
    fireEvent.click(prev!);
    expect(table.previousPage).toHaveBeenCalledTimes(1);
    fireEvent.click(next!);
    expect(table.nextPage).toHaveBeenCalledTimes(1);
    fireEvent.click(last!);
    expect(table.setPageIndex).toHaveBeenLastCalledWith(3);
  });

  it('changing rows-per-page forwards the numeric page size', () => {
    const table = fakeTable({});
    render(<DataTablePagination table={table} pageSizeOptions={[10, 25, 100]} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '25' } });

    expect(table.setPageSize).toHaveBeenCalledWith(25);
  });
});
