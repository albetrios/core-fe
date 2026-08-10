import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table';

/**
 * The single feature set every table in the app is built from.
 *
 * TanStack Table v9 makes features opt-in for tree-shaking: a table only has
 * `getCanSort()`, `toggleVisibility()` etc. if the matching feature was passed
 * in. Declaring one shared set — rather than a per-table set — is what lets the
 * shared `DataTable*` components stay generic over `TData` alone. Generic over
 * an open `TFeatures` they could not call any feature method, because the
 * compiler cannot know the feature is present.
 *
 * Add a feature here when a table needs it; the row model that powers it goes
 * in the same object (v9 moved row models out of the table options).
 *
 * `filterFns` registers one comparator rather than the whole built-in registry:
 * registering the registry object is deprecated precisely because it opts the
 * bundle out of tree-shaking, pulling in every built-in comparator. Only
 * `includesString` is listed because only it is load-bearing — the members
 * search column resolves to it, and dropping it silently stops filtering
 * (covered by MembersTable's filter test). No `sortFns` slot is registered:
 * sorting resolves to a built-in default, verified by removing the slot and
 * confirming the sorting tests still pass. Register a comparator here the
 * moment a column names one.
 */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
});

/** Feature set backing every shared `DataTable*` component. */
export type DataTableFeatures = typeof dataTableFeatures;
