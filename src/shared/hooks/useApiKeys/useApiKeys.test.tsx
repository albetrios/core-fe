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

const { listApiKeys, createApiKey, renameApiKey, revokeApiKey } = vi.hoisted(() => ({
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  renameApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));
vi.mock('@/shared/api/organization-api.ts', () => ({
  listApiKeys,
  createApiKey,
  renameApiKey,
  revokeApiKey,
}));
const { notifySuccess, notifyError } = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: notifySuccess, error: notifyError },
}));

import { useApiKeys, useRenameApiKey, useRevokeApiKey } from './useApiKeys.ts';

type Row = { id: string; name?: string };

const ORG = 'org_aaaaaaaaaaaaaaaaaaaaa';
const LIST_KEY = orgQueryKeys.apiKeysList(ORG, {});

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

describe('useApiKeys', () => {
  it('accumulates the first page of keys under the list key', async () => {
    listApiKeys.mockResolvedValue({
      rows: [{ id: 'key_1', name: 'CI' }],
      next: null,
      hasMore: false,
    });
    const { result } = renderHook(() => useApiKeys(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows).toEqual([{ id: 'key_1', name: 'CI' }]);
  });

  it('stays idle without an active organization (no doomed request mid-switch)', async () => {
    useOrganizationStore.setState({ organizationId: null });
    const { result } = renderHook(() => useApiKeys(), { wrapper });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(listApiKeys).not.toHaveBeenCalled();
  });
});

describe('useRenameApiKey', () => {
  it('optimistically renames the key and rolls back on error', async () => {
    seedPage(client, [{ id: 'key_1', name: 'Old' }]);
    renameApiKey.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRenameApiKey(), { wrapper });

    result.current.mutate({ id: 'key_1', name: 'New' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(pageRows(client)?.[0]?.name).toBe('Old');
    expect(notifyError).toHaveBeenCalledTimes(1);
  });
});

describe('useRevokeApiKey', () => {
  it('optimistically drops the key and toasts on success', async () => {
    seedPage(client, [{ id: 'key_1' }, { id: 'key_2' }]);
    revokeApiKey.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRevokeApiKey(), { wrapper });

    result.current.mutate('key_1');

    await waitFor(() => expect(ids(client)).toEqual(['key_2']));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it('restores the key on error', async () => {
    seedPage(client, [{ id: 'key_1' }, { id: 'key_2' }]);
    revokeApiKey.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useRevokeApiKey(), { wrapper });

    result.current.mutate('key_1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(ids(client)).toEqual(['key_1', 'key_2']);
    expect(notifyError).toHaveBeenCalledTimes(1);
  });
});
