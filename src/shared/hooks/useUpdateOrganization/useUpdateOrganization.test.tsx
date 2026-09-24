import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { meContextQueryKey } from '@/shared/tenancy/me-context.ts';

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

  it('invalidates BOTH the organizations list and me/context on success', async () => {
    // Regression: renaming only refreshed the General panel (['organizations']),
    // leaving the org switcher + dashboard header (me/context) on the old name.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateOrganization(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate({ name: 'Acme Co.' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['organizations'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: meContextQueryKey });
  });
});
