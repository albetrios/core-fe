import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { useAssignablePermissions } from './useAssignablePermissions.ts';

const { listPermissionCatalog } = vi.hoisted(() => ({
  listPermissionCatalog: vi.fn(),
}));
vi.mock('@/shared/api/organization-api.ts', () => ({
  listPermissionCatalog,
}));

const CATALOG = [
  { code: 'organization:read', name: 'View Organization', category: 'tenancy' },
  { code: 'role:manage', name: 'Manage Roles', category: 'tenancy' },
  { code: 'organization:delete', name: 'Delete Organization', category: 'tenancy' },
  { code: 'webhook:manage', name: 'Manage Webhooks', category: 'notify' },
];

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  useOrganizationStore.getState().clearOrganization();
});

describe('useAssignablePermissions', () => {
  // core-be's `assertCallerCanGrantPermissionCodes` refuses any code the caller does not hold,
  // so offering the whole catalog would present grants that error on submit. This is the
  // intersection that keeps the picker honest.
  it('offers only the catalog codes the caller actually holds', async () => {
    listPermissionCatalog.mockResolvedValue(CATALOG);
    useOrganizationStore.setState({
      permissions: ['organization:read', 'role:manage'],
      permissionsResolved: true,
    });

    const { result } = renderHook(() => useAssignablePermissions(), { wrapper });

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows.map((row) => row.code)).toEqual([
      'organization:read',
      'role:manage',
    ]);
    // The code that separates an Admin from an Owner — never offered to a caller without it.
    expect(result.current.rows.map((row) => row.code)).not.toContain(
      'organization:delete',
    );
  });

  it('offers nothing while the permission set is still empty', async () => {
    listPermissionCatalog.mockResolvedValue(CATALOG);

    const { result } = renderHook(() => useAssignablePermissions(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.rows).toEqual([]);
  });

  it('reports the failure instead of rendering an empty picker as "nothing to grant"', async () => {
    listPermissionCatalog.mockRejectedValue(new Error('catalog down'));
    useOrganizationStore.setState({
      permissions: ['organization:read'],
      permissionsResolved: true,
    });

    const { result } = renderHook(() => useAssignablePermissions(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.rows).toEqual([]);
  });
});
