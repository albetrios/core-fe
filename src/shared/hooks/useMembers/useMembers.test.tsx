import {
  type InfiniteData,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListPage } from '@/shared/api/fetch-list-page.ts';
import { orgQueryKeys } from '@/shared/api/organization-query-keys.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

const { listMembers, updateMemberRole, removeMember, updateMemberStatus } = vi.hoisted(
  () => ({
    listMembers: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    updateMemberStatus: vi.fn(),
  }),
);
vi.mock('@/shared/api/organization-api.ts', () => ({
  listMembers,
  updateMemberRole,
  removeMember,
  updateMemberStatus,
}));

const { notifySuccess, notifyError } = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: notifySuccess, error: notifyError },
}));

import {
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
  useUpdateMemberStatus,
} from './useMembers.ts';

type Row = { id: string; role?: string; status?: string };

const ORG = 'org_aaaaaaaaaaaaaaaaaaaaa';
// The infinite list caches under the param-scoped child key; mutations patch it
// via the `members(ORG)` prefix.
const LIST_KEY = orgQueryKeys.membersList(ORG, {});

/** Seed a single accumulated page so optimistic patches have a cache to touch. */
function seedPage(client: QueryClient, rows: Row[]) {
  client.setQueryData<InfiniteData<ListPage<Row>>>(LIST_KEY, {
    pages: [{ rows, next: null, hasMore: false }],
    pageParams: [undefined],
  });
}

const pageRows = (client: QueryClient): Row[] | undefined =>
  client.getQueryData<InfiniteData<ListPage<Row>>>(LIST_KEY)?.pages[0]?.rows;
const ids = (client: QueryClient) => pageRows(client)?.map((r) => r.id);

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  useOrganizationStore.setState({ organizationId: ORG });
});

afterEach(() => {
  useOrganizationStore.getState().clearOrganization();
});

describe('useMembers', () => {
  it('accumulates the first page of members under the list key', async () => {
    listMembers.mockResolvedValue({
      rows: [{ id: 'm_1', name: 'Ada' }],
      next: null,
      hasMore: false,
    });
    const { result } = renderHook(() => useMembers(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows).toEqual([{ id: 'm_1', name: 'Ada' }]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('passes the search term through to the fetcher', async () => {
    listMembers.mockResolvedValue({ rows: [], next: null, hasMore: false });
    renderHook(() => useMembers({ q: 'ada' }), { wrapper });
    await waitFor(() =>
      expect(listMembers).toHaveBeenCalledWith(expect.objectContaining({ q: 'ada' })),
    );
  });

  it('stays idle without an active organization (no doomed request mid-switch)', async () => {
    useOrganizationStore.setState({ organizationId: null });
    const { result } = renderHook(() => useMembers(), { wrapper });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(listMembers).not.toHaveBeenCalled();
  });
});

describe('useUpdateMemberRole', () => {
  it('optimistically patches the role across the cached page and keeps it on success', async () => {
    seedPage(client, [
      { id: 'm_1', role: 'member' },
      { id: 'm_2', role: 'member' },
    ]);
    updateMemberRole.mockResolvedValue({ id: 'm_1', role: 'admin' });
    const { result } = renderHook(() => useUpdateMemberRole(), { wrapper });

    result.current.mutate({ membershipId: 'm_1', role: 'admin' });

    await waitFor(() =>
      expect(pageRows(client)?.find((m) => m.id === 'm_1')?.role).toBe('admin'),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(pageRows(client)?.find((m) => m.id === 'm_2')?.role).toBe('member');
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it('rolls back the role when the request fails', async () => {
    seedPage(client, [{ id: 'm_1', role: 'member' }]);
    updateMemberRole.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useUpdateMemberRole(), { wrapper });

    result.current.mutate({ membershipId: 'm_1', role: 'admin' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(pageRows(client)?.[0]?.role).toBe('member');
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});

describe('useRemoveMember', () => {
  it('optimistically drops the row and toasts on success', async () => {
    seedPage(client, [{ id: 'm_1' }, { id: 'm_2' }]);
    removeMember.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRemoveMember(), { wrapper });

    result.current.mutate('m_1');

    await waitFor(() => expect(ids(client)).toEqual(['m_2']));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it('restores the removed row when the request fails', async () => {
    seedPage(client, [{ id: 'm_1' }, { id: 'm_2' }]);
    removeMember.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useRemoveMember(), { wrapper });

    result.current.mutate('m_1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(ids(client)).toEqual(['m_1', 'm_2']);
    expect(notifyError).toHaveBeenCalledTimes(1);
  });
});

describe('useUpdateMemberStatus', () => {
  it('optimistically flips the status badge (suspend)', async () => {
    seedPage(client, [{ id: 'm_1', status: 'active' }]);
    updateMemberStatus.mockResolvedValue({ id: 'm_1', status: 'suspended' });
    const { result } = renderHook(() => useUpdateMemberStatus(), { wrapper });

    result.current.mutate({ membershipId: 'm_1', status: 'suspended' });

    await waitFor(() => expect(pageRows(client)?.[0]?.status).toBe('suspended'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the status when the request fails', async () => {
    seedPage(client, [{ id: 'm_1', status: 'active' }]);
    updateMemberStatus.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useUpdateMemberStatus(), { wrapper });

    result.current.mutate({ membershipId: 'm_1', status: 'suspended' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(pageRows(client)?.[0]?.status).toBe('active');
    expect(notifyError).toHaveBeenCalledTimes(1);
  });
});
