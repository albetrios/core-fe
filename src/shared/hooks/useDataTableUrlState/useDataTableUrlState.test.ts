import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  filtersFromSearch,
  sortingFromSearch,
  sortingToSearch,
  useDataTableUrlState,
} from './useDataTableUrlState.ts';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => ({}),
}));

describe('sortingFromSearch', () => {
  it('parses a well-formed column:direction descriptor', () => {
    expect(sortingFromSearch('name:asc')).toEqual([{ id: 'name', desc: false }]);
    expect(sortingFromSearch('joined:desc')).toEqual([{ id: 'joined', desc: true }]);
  });

  it('rejects missing, malformed, and partial descriptors', () => {
    expect(sortingFromSearch(undefined)).toEqual([]);
    expect(sortingFromSearch('')).toEqual([]);
    expect(sortingFromSearch('name')).toEqual([]);
    expect(sortingFromSearch('name:sideways')).toEqual([]);
    expect(sortingFromSearch(':asc')).toEqual([]);
  });
});

describe('sortingToSearch', () => {
  it('serializes the first sort and drops empty state', () => {
    expect(sortingToSearch([])).toBeUndefined();
    expect(sortingToSearch([{ id: 'name', desc: false }])).toBe('name:asc');
    expect(sortingToSearch([{ id: 'role', desc: true }])).toBe('role:desc');
  });

  it('round-trips through sortingFromSearch', () => {
    const state = [{ id: 'email', desc: true }];
    expect(sortingFromSearch(sortingToSearch(state))).toEqual(state);
  });
});

describe('filtersFromSearch', () => {
  it('returns nothing when URL sync is disabled', () => {
    expect(filtersFromSearch({ q: 'ada', role: 'admin' }, false)).toEqual([]);
  });

  it('maps q to the name filter and a concrete role to the role filter', () => {
    expect(filtersFromSearch({ q: 'ada' }, true)).toEqual([{ id: 'name', value: 'ada' }]);
    expect(filtersFromSearch({ role: 'admin' }, true)).toEqual([
      { id: 'role', value: 'admin' },
    ]);
    expect(filtersFromSearch({ q: 'ada', role: 'viewer' }, true)).toEqual([
      { id: 'name', value: 'ada' },
      { id: 'role', value: 'viewer' },
    ]);
  });

  it('treats role=all and empty q as no filter', () => {
    expect(filtersFromSearch({ role: 'all' }, true)).toEqual([]);
    expect(filtersFromSearch({ q: '' }, true)).toEqual([]);
    expect(filtersFromSearch({}, true)).toEqual([]);
  });
});

describe('useDataTableUrlState — writing to the URL', () => {
  beforeEach(() => navigateMock.mockClear());

  it.each([
    [
      'sorting',
      (url: ReturnType<typeof useDataTableUrlState>) =>
        url.onSortingChange([{ id: 'name', desc: false }]),
    ],
    [
      'filtering',
      (url: ReturnType<typeof useDataTableUrlState>) =>
        url.onFiltersChange([{ id: 'name', value: 'ada' }]),
    ],
    [
      'paginating',
      (url: ReturnType<typeof useDataTableUrlState>) => url.onPaginationChange(2, 25),
    ],
    [
      'searching',
      (url: ReturnType<typeof useDataTableUrlState>) => url.setGlobalFilter('ada'),
    ],
  ])('%s patches the search in place and keeps the hash', (_label, act) => {
    // "Patches only the search keys" has to include the hash: the router
    // resolves an omitted `hash` to none, so a table rendered inside the settings
    // HASH modal would have closed the modal the first time a column was sorted.
    const { result } = renderHook(() => useDataTableUrlState(true));

    act(result.current);

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: '.', replace: true, hash: true }),
    );
  });

  it('merges the patch over the current search and drops emptied keys', () => {
    const { result } = renderHook(() => useDataTableUrlState(true));

    result.current.setGlobalFilter('');

    const updater = navigateMock.mock.calls.at(-1)?.[0]?.search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(updater({ q: 'ada', role: 'admin', tab: 'members' })).toEqual({
      role: 'admin',
      tab: 'members',
      page: 1,
    });
  });

  it('never touches the URL when sync is off', () => {
    const { result } = renderHook(() => useDataTableUrlState(false));

    result.current.onSortingChange([{ id: 'name', desc: true }]);
    result.current.setGlobalFilter('ada');

    expect(navigateMock).not.toHaveBeenCalled();
  });
});
