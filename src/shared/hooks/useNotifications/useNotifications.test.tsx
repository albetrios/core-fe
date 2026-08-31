import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationQueryKeys } from '@/shared/api/notification-query-keys.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import {
  NOTIFICATION_PREFERENCES_TOAST_ID,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
  useUpdateNotificationPreferences,
} from './useNotifications.ts';

const { listMock, countMock, markReadMock, markAllMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  countMock: vi.fn(),
  markReadMock: vi.fn(),
  markAllMock: vi.fn(),
}));
vi.mock('@/shared/api/notifications-api.ts', () => ({
  listNotifications: listMock,
  getUnreadCount: countMock,
  markNotificationRead: markReadMock,
  markAllNotificationsRead: markAllMock,
  updateNotificationPreferences: updatePrefsMock,
}));
const { updatePrefsMock, successMock } = vi.hoisted(() => ({
  updatePrefsMock: vi.fn(),
  successMock: vi.fn(),
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { error: vi.fn(), success: successMock },
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

  // SET-2: the grid saves on every flick, so four flicks fired four toasts and
  // stacked them. A stable id makes sonner replace the previous one instead.
  it('saves preferences under one stable toast id', async () => {
    updatePrefsMock.mockResolvedValue([]);
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateNotificationPreferences(), { wrapper });

    await result.current.mutateAsync([]);
    await result.current.mutateAsync([]);
    await result.current.mutateAsync([]);
    await result.current.mutateAsync([]);

    expect(successMock).toHaveBeenCalledTimes(4);
    for (const call of successMock.mock.calls) {
      expect(call[1]).toEqual({ id: NOTIFICATION_PREFERENCES_TOAST_ID });
    }
  });
});
