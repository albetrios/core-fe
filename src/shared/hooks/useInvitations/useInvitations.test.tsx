import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { orgQueryKeys } from '@/shared/api/organization-query-keys.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

const { inviteMember } = vi.hoisted(() => ({
  inviteMember: vi.fn(),
}));
vi.mock('@/shared/api/organization-api.ts', () => ({
  inviteMember,
}));
const { notifySuccess, notifyError } = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: notifySuccess, error: notifyError },
}));

import { useInviteMember } from './useInvitations.ts';

const ORG = 'org_aaaaaaaaaaaaaaaaaaaaa';

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

describe('useInviteMember', () => {
  it('invites via inviteMember and invalidates the MEMBERS list (not invitations)', async () => {
    // Invited people land in the members list as INVITED — that's what must
    // refetch, so the new invitee shows up without a manual reload.
    inviteMember.mockResolvedValue({ id: 'mem_new', email: 'new@x.test' });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useInviteMember(), { wrapper });

    result.current.mutate({ email: 'new@x.test', roleId: 'rol_1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(inviteMember).toHaveBeenCalledWith({ email: 'new@x.test', roleId: 'rol_1' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: orgQueryKeys.members(ORG) });
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });
});
