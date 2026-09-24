import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useNotificationsMock, useUnreadCountMock, markReadMutate, markAllMutate } =
  vi.hoisted(() => ({
    useNotificationsMock: vi.fn(),
    useUnreadCountMock: vi.fn(),
    markReadMutate: vi.fn(),
    markAllMutate: vi.fn(),
  }));
vi.mock('@/shared/hooks/useNotifications/index.ts', () => ({
  useNotifications: useNotificationsMock,
  useUnreadCount: useUnreadCountMock,
  useMarkNotificationRead: () => ({ mutate: markReadMutate, isPending: false }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllMutate, isPending: false }),
}));

import { NotificationCenter } from './NotificationCenter.tsx';

const ITEM = {
  id: 'ntf_x',
  category: 'member',
  title: 'New member joined',
  body: 'Ada Byron accepted your invitation.',
  isRead: false,
  href: null,
  createdAt: '2026-06-23T09:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  useNotificationsMock.mockReturnValue({
    data: [ITEM],
    isLoading: false,
    isError: false,
  });
  useUnreadCountMock.mockReturnValue({ data: 3 });
});

describe('NotificationCenter', () => {
  it('shows the bell with an unread badge', () => {
    render(<NotificationCenter />);
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('3');
  });

  it('hides the badge when there are no unread notifications', () => {
    useUnreadCountMock.mockReturnValue({ data: 0 });
    render(<NotificationCenter />);
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });

  it('opens a panel listing notifications', async () => {
    const user = userEvent.setup();
    render(<NotificationCenter />);
    await user.click(screen.getByTestId('notification-bell'));
    expect(await screen.findByTestId('notifications-list')).toBeInTheDocument();
    expect(screen.getByText('New member joined')).toBeInTheDocument();
  });

  it('shows an empty state when the inbox is empty', async () => {
    useNotificationsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    useUnreadCountMock.mockReturnValue({ data: 0 });
    const user = userEvent.setup();
    render(<NotificationCenter />);
    await user.click(screen.getByTestId('notification-bell'));
    expect(await screen.findByTestId('empty-state')).toBeInTheDocument();
    // An action that can never apply to an empty inbox is hidden, not disabled.
    expect(screen.queryByTestId('notification-mark-all')).not.toBeInTheDocument();
  });

  it('marks an unread item read on click', async () => {
    const user = userEvent.setup();
    render(<NotificationCenter />);
    await user.click(screen.getByTestId('notification-bell'));
    await user.click(await screen.findByTestId('notification-ntf_x'));
    expect(markReadMutate).toHaveBeenCalledWith('ntf_x', expect.anything());
  });

  it('never sends two PATCHes when a row is double-clicked', async () => {
    // `markRead.isPending` is shared React state — it lands a render too late to
    // stop the second click, so the per-id ref is what holds.
    const user = userEvent.setup();
    render(<NotificationCenter />);
    await user.click(screen.getByTestId('notification-bell'));
    const row = await screen.findByTestId('notification-ntf_x');

    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() => expect(markReadMutate).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(markReadMutate).toHaveBeenCalledTimes(1);
  });

  it('marks all read', async () => {
    const user = userEvent.setup();
    render(<NotificationCenter />);
    await user.click(screen.getByTestId('notification-bell'));
    await user.click(await screen.findByTestId('notification-mark-all'));
    expect(markAllMutate).toHaveBeenCalledTimes(1);
  });
});
