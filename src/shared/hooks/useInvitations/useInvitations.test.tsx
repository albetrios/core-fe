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

const { inviteMember, resendInvitation, revokeInvitation } = vi.hoisted(() => ({
  inviteMember: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}));
vi.mock('@/shared/api/organization-api.ts', () => ({
  inviteMember,
  resendInvitation,
  revokeInvitation,
}));
const { notifySuccess, notifyError } = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { success: notifySuccess, error: notifyError },
}));

import {
  useInviteMember,
  useResendInvitation,
  useRevokeInvitation,
} from './useInvitations.ts';

type Row = { id: string; invitation: { id: string; expiresAt: string } | null };

const ORG = 'org_aaaaaaaaaaaaaaaaaaaaa';
// The infinite list caches under the param-scoped child key; mutations patch it
// via the `members(ORG)` prefix.
const LIST_KEY = orgQueryKeys.membersList(ORG, {});
const EXPIRES = '2026-10-01T00:00:00.000Z';

/** Seed a single accumulated page so the optimistic removal has a cache to touch. */
function seedPage(rows: Row[]) {
  client.setQueryData<InfiniteData<ListPage<Row>>>(LIST_KEY, {
    pages: [{ rows, next: null, hasMore: false }],
    pageParams: [undefined],
  });
}
const ids = () =>
  client
    .getQueryData<InfiniteData<ListPage<Row>>>(LIST_KEY)
    ?.pages[0]?.rows.map((r) => r.id);

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

describe('useResendInvitation', () => {
  it('resends by INVITATION id, refreshes the members list and names the invitee', async () => {
    resendInvitation.mockResolvedValue({ email: 'late@x.test', expiresAt: EXPIRES });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useResendInvitation(), { wrapper });

    result.current.mutate('inv_aaaaaaaaaaaaaaaaaaaaa');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(resendInvitation).toHaveBeenCalledWith('inv_aaaaaaaaaaaaaaaaaaaaa');
    // The row's expiry moved, so the list must refetch to show it.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: orgQueryKeys.members(ORG) });
    expect(notifySuccess).toHaveBeenCalledWith(expect.stringContaining('late@x.test'));
  });

  it("surfaces core-be's refusal as an error toast, never a success", async () => {
    resendInvitation.mockRejectedValue(new Error('expired'));
    const { result } = renderHook(() => useResendInvitation(), { wrapper });

    result.current.mutate('inv_aaaaaaaaaaaaaaaaaaaaa');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});

describe('useRevokeInvitation', () => {
  it('drops the row whose INVITATION matches, not a member id, and toasts', async () => {
    seedPage([
      { id: 'mem_invited', invitation: { id: 'inv_one', expiresAt: EXPIRES } },
      { id: 'mem_active', invitation: null },
    ]);
    revokeInvitation.mockResolvedValue({ id: 'inv_one' });
    const { result } = renderHook(() => useRevokeInvitation(), { wrapper });

    result.current.mutate('inv_one');

    await waitFor(() => expect(ids()).toEqual(['mem_active']));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(revokeInvitation).toHaveBeenCalledWith('inv_one');
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it('restores the row when the revoke fails', async () => {
    seedPage([{ id: 'mem_invited', invitation: { id: 'inv_one', expiresAt: EXPIRES } }]);
    revokeInvitation.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useRevokeInvitation(), { wrapper });

    result.current.mutate('inv_one');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(ids()).toEqual(['mem_invited']);
    expect(notifyError).toHaveBeenCalledTimes(1);
  });

  it('stays silent on success when the caller owns the undo toast', async () => {
    revokeInvitation.mockResolvedValue({ id: 'inv_one' });
    const { result } = renderHook(
      () => useRevokeInvitation({ suppressSuccessToast: true }),
      {
        wrapper,
      },
    );

    result.current.mutate('inv_one');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});
