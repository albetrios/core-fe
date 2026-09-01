import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationQueryKeys } from '@/shared/api/notification-query-keys.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { notify } from '@/shared/notify/index.ts';

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationPreferences,
  useNotifications,
  useUnreadCount,
  useUpdateNotificationPreferences,
} from './useNotifications.ts';

const { listMock, countMock, markReadMock, markAllMock, prefsMock, updatePrefsMock } =
  vi.hoisted(() => ({
    listMock: vi.fn(),
    countMock: vi.fn(),
    markReadMock: vi.fn(),
    markAllMock: vi.fn(),
    prefsMock: vi.fn(),
    updatePrefsMock: vi.fn(),
  }));
vi.mock('@/shared/api/notifications-api.ts', () => ({
  listNotifications: listMock,
  getUnreadCount: countMock,
  markNotificationRead: markReadMock,
  markAllNotificationsRead: markAllMock,
  getNotificationPreferences: prefsMock,
  updateNotificationPreferences: updatePrefsMock,
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { error: vi.fn(), success: vi.fn() },
}));

const ITEM = {
  id: 'ntf_a',
  category: 'system',
  title: 'T',
  body: 'B',
  isRead: false,
  href: null,
  createdAt: '2026-06-23T00:00:00.000Z',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  useOrganizationStore.getState().clearOrganization();
  listMock.mockResolvedValue([ITEM]);
  countMock.mockResolvedValue(3);
  markReadMock.mockResolvedValue(undefined);
  markAllMock.mockResolvedValue(undefined);
});

describe('useNotifications', () => {
  it('loads the inbox list', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([ITEM]);
  });

  it('loads the unread count', async () => {
    const { result } = renderHook(() => useUnreadCount(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(3);
  });

  it('marks one notification read', async () => {
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    result.current.mutate('ntf_a');
    await waitFor(() => expect(markReadMock).toHaveBeenCalledWith('ntf_a'));
  });

  it('marks all notifications read', async () => {
    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(markAllMock).toHaveBeenCalledTimes(1));
  });

  it('keys the inbox by active org so a switch never reuses the prior org cache', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    // Org A was visited earlier — its inbox sits in the cache.
    client.setQueryData(notificationQueryKeys.list('org_a'), [
      { ...ITEM, id: 'ntf_org_a' },
    ]);

    // Active org is now B. The hook must read org B's key, fetch B's own rows,
    // and never surface org A's cached notifications.
    useOrganizationStore.setState({ organizationId: 'org_b' });
    listMock.mockResolvedValue([{ ...ITEM, id: 'ntf_org_b' }]);
    const { result } = renderHook(() => useNotifications(), { wrapper: shared });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ ...ITEM, id: 'ntf_org_b' }]);
    // Org A's entry stays its own distinct cache key — untouched, never shown in B.
    expect(client.getQueryData(notificationQueryKeys.list('org_a'))).toEqual([
      { ...ITEM, id: 'ntf_org_a' },
    ]);
  });

  it('optimistically flips the row and decrements the badge before the API answers', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const listKey = notificationQueryKeys.list(null);
    const countKey = notificationQueryKeys.unreadCount(null);
    client.setQueryData(listKey, [ITEM, { ...ITEM, id: 'ntf_b' }]);
    client.setQueryData(countKey, 2);

    let resolveMarkRead: (() => void) | undefined;
    markReadMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMarkRead = resolve;
      }),
    );

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: shared });
    result.current.mutate('ntf_a');

    // The UI updates while the request is still in flight.
    await waitFor(() => {
      const rows = client.getQueryData<Array<typeof ITEM>>(listKey);
      expect(rows?.find((n) => n.id === 'ntf_a')?.isRead).toBe(true);
    });
    expect(client.getQueryData<Array<typeof ITEM>>(listKey)?.[1]?.isRead).toBe(false);
    expect(client.getQueryData(countKey)).toBe(1);

    resolveMarkRead?.();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the optimistic update and toasts when mark-read fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const listKey = notificationQueryKeys.list(null);
    const countKey = notificationQueryKeys.unreadCount(null);
    client.setQueryData(listKey, [ITEM]);
    client.setQueryData(countKey, 1);
    markReadMock.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: shared });
    result.current.mutate('ntf_a');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(listKey)).toEqual([ITEM]); // isRead back to false
    expect(client.getQueryData(countKey)).toBe(1);
    expect(notify.error).toHaveBeenCalledTimes(1);
  });

  it('loads the delivery preference matrix', async () => {
    const prefs = [{ category: 'billing', channel: 'email', enabled: true }];
    prefsMock.mockResolvedValue(prefs);

    const { result } = renderHook(() => useNotificationPreferences(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(prefs);
  });

  it('saving preferences seeds the cache with the server-confirmed set', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const saved = [{ category: 'security', channel: 'email', enabled: false }];
    updatePrefsMock.mockResolvedValue(saved);

    const { result } = renderHook(() => useUpdateNotificationPreferences(), {
      wrapper: shared,
    });
    result.current.mutate(saved as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updatePrefsMock).toHaveBeenCalledWith(saved);
    expect(client.getQueryData(notificationQueryKeys.preferences())).toEqual(saved);
  });
});
