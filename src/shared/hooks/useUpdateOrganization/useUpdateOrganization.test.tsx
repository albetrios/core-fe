import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { meContextQueryKey } from '@/shared/tenancy/me-context.ts';
import { myOrganizationsQueryKey } from '@/shared/tenancy/my-organization-summaries.ts';

import { useUpdateOrganization } from './useUpdateOrganization.ts';

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }));
vi.mock('@/shared/tenancy/my-organizations.ts', () => ({
  updateOrganization: updateMock,
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.resetAllMocks();
  useOrganizationStore.setState({ organizationId: 'org_acme' });
  updateMock.mockResolvedValue({
    id: 'org_acme',
    name: 'Acme Co.',
    slug: 'acme',
    status: 'active',
  });
});

describe('useUpdateOrganization', () => {
  it('renames the active org via updateOrganization with the store org id', async () => {
    const { result } = renderHook(() => useUpdateOrganization(), { wrapper });
    result.current.mutate({ name: 'Acme Co.' });
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('org_acme', { name: 'Acme Co.' }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('refreshes the organization list the switcher reads, and me/context', async () => {
    // Regression: the rename invalidated `['organizations']`, a key only the
    // General panel read. The switcher, dashboard panel and command palette read
    // the summaries list, which kept the old name for up to five minutes.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(myOrganizationsQueryKey, [{ id: 'org_acme', name: 'Acme Inc.' }]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateOrganization(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate({ name: 'Acme Co.' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryState(myOrganizationsQueryKey)?.isInvalidated).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: meContextQueryKey });
  });
});
