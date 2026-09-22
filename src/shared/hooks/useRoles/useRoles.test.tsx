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
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

const { listRoles, createRole, updateRole, deleteRole, getRolePermissions } = vi.hoisted(
  () => ({
    listRoles: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    getRolePermissions: vi.fn(),
  }),
);
vi.mock('@/shared/api/organization-api.ts', () => ({
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
}));
const { notifySuccess, notifyError } = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: notifySuccess, error: notifyError },
}));

import {
  useDeleteRole,
  useRolePermissions,
  useRoles,
  useUpdateRole,
} from './useRoles.ts';

type Row = { id: string; name?: string };

const ORG = 'org_aaaaaaaaaaaaaaaaaaaaa';
const LIST_KEY = orgQueryKeys.rolesList(ORG, {});

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
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  // `GET /tenancy/organization/roles` enforces `role:read`; the hook skips the request
  // without it, so the default fixture must hold it. `useCan` also requires a signed-in
  // user — a permission set with no user is not a grant.
  useAuthStore.setState({
    user: { id: 'u', email: 'a@b.test', role: 'user' },
    isAuthenticated: true,
  });
  useOrganizationStore.setState({
    organizationId: ORG,
    permissions: ['role:read'],
    permissionsResolved: true,
  });
});

afterEach(() => {
  useOrganizationStore.getState().clearOrganization();
});

describe('useRoles', () => {
  it('accumulates the first page of roles under the list key', async () => {
    listRoles.mockResolvedValue({
      rows: [{ id: 'role_1', name: 'Admin' }],
      next: null,
      hasMore: false,
    });
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows).toEqual([{ id: 'role_1', name: 'Admin' }]);
  });

  it('stays idle without an active organization (no doomed request mid-switch)', async () => {
    useOrganizationStore.setState({ organizationId: null });
    const { result } = renderHook(() => useRoles(), { wrapper });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(listRoles).not.toHaveBeenCalled();
  });
});

describe('useRolePermissions', () => {
  it("fetches a role's permission codes when a roleId is given", async () => {
    getRolePermissions.mockResolvedValue(['membership:read', 'membership:manage']);
    const { result } = renderHook(() => useRolePermissions('rol_1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getRolePermissions).toHaveBeenCalledWith('rol_1');
    expect(result.current.data).toEqual(['membership:read', 'membership:manage']);
  });

  it('stays disabled (never fetches) while the roleId is undefined', () => {
    const { result } = renderHook(() => useRolePermissions(undefined), { wrapper });
    expect(getRolePermissions).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useUpdateRole', () => {
  it('optimistically renames the role and keeps it on success', async () => {
    seedPage(client, [{ id: 'role_1', name: 'Old' }]);
    updateRole.mockResolvedValue({ id: 'role_1', name: 'New' });
    const { result } = renderHook(() => useUpdateRole(), { wrapper });

    result.current.mutate({ id: 'role_1', name: 'New' });

    await waitFor(() => expect(pageRows(client)?.[0]?.name).toBe('New'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it('rolls back the rename on error', async () => {
    seedPage(client, [{ id: 'role_1', name: 'Old' }]);
    updateRole.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useUpdateRole(), { wrapper });

    result.current.mutate({ id: 'role_1', name: 'New' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(pageRows(client)?.[0]?.name).toBe('Old');
    expect(notifyError).toHaveBeenCalledTimes(1);
  });
});

describe('useDeleteRole', () => {
  it('optimistically drops the role and restores it on error', async () => {
    seedPage(client, [{ id: 'role_1' }, { id: 'role_2' }]);
    deleteRole.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useDeleteRole(), { wrapper });

    result.current.mutate('role_1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(ids(client)).toEqual(['role_1', 'role_2']);
    expect(notifyError).toHaveBeenCalledTimes(1);
  });
});
