import { describe, expect, it } from 'vitest';

import {
  filtersFromSearch,
  sortingFromSearch,
  sortingToSearch,
} from './useDataTableUrlState.ts';

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
