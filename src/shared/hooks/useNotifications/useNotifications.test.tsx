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

/** A resolved org scope — what every real caller of these hooks has. */
const ORG_ID = 'org_acme0000000000000000';

beforeEach(() => {
  vi.clearAllMocks();
  useOrganizationStore.getState().clearOrganization();
  // The polls are gated on a resolved org scope (SHELL-10), so a test that
  // wants them to run has to say which org it is running against.
  useOrganizationStore.setState({ organizationId: ORG_ID });
  listMock.mockResolvedValue([ITEM]);
  countMock.mockResolvedValue(3);
  markReadMock.mockResolvedValue(undefined);
  markAllMock.mockResolvedValue(undefined);
});

describe('useNotifications', () => {
  it('loads the inbox list', async () => {
    const { result } = renderHook(() => useNotifications({ isInboxOpen: true }), {
      wrapper,
    });
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
    const { result } = renderHook(() => useNotifications({ isInboxOpen: true }), {
      wrapper: shared,
    });

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

describe('SHELL-10 — the polls wait for an org scope', () => {
  /**
   * Both hooks poll every 30 s. Before the session context resolves, and while
   * an org switch is in flight, `organizationId` is null — and a request in
   * that window can only come back `Forbidden`, once per interval, forever.
   * `useMembers` already carried this gate; these two did not.
   */
  beforeEach(() => {
    useOrganizationStore.setState({ organizationId: null });
  });

  it('does not fetch the inbox without a resolved org', async () => {
    const { result } = renderHook(() => useNotifications({ isInboxOpen: true }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(listMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('does not fetch the unread count without a resolved org', async () => {
    const { result } = renderHook(() => useUnreadCount(), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(countMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('starts fetching as soon as the org scope resolves', async () => {
    const { result, rerender } = renderHook(
      () => useNotifications({ isInboxOpen: true }),
      { wrapper },
    );
    expect(listMock).not.toHaveBeenCalled();

    useOrganizationStore.setState({ organizationId: ORG_ID });
    rerender();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listMock).toHaveBeenCalled();
  });
});

/**
 * The inbox renders only inside the bell popover, but the hook sits at the top
 * of a component the app shell mounts on every authenticated page. Before this
 * gate, a closed bell fetched a full inbox every 30s that nothing displayed.
 */
describe('inbox poll is gated on the popover being open', () => {
  beforeEach(() => {
    useOrganizationStore.setState({ organizationId: ORG_ID });
  });

  it('does not fetch the inbox while the popover is closed', async () => {
    const { result } = renderHook(() => useNotifications({ isInboxOpen: false }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(listMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches the inbox as soon as the popover opens', async () => {
    let open = false;
    const { result, rerender } = renderHook(
      () => useNotifications({ isInboxOpen: open }),
      { wrapper },
    );
    expect(listMock).not.toHaveBeenCalled();

    open = true;
    rerender();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  // The badge is the whole point of a notification bell — it has to stay live
  // whether or not anyone has opened the popover, so it keeps the org gate only.
  it('keeps polling the unread count while the popover is closed', async () => {
    const { result } = renderHook(
      () => ({
        inbox: useNotifications({ isInboxOpen: false }),
        badge: useUnreadCount(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.badge.isSuccess).toBe(true));
    expect(countMock).toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
  });
});
