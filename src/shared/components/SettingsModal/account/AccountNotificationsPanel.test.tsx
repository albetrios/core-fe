import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/tests/fixtures/notification-fixtures.ts';

const { usePrefsMock, updateMutate, updateStateRef, requestPermissionMock } = vi.hoisted(
  () => ({
    usePrefsMock: vi.fn(),
    updateMutate: vi.fn(),
    /** Drives `isPending` the way the real mutation would. */
    updateStateRef: { isPending: false },
    requestPermissionMock: vi.fn(),
  }),
);
vi.mock('@/shared/hooks/useNotifications/index.ts', () => ({
  useNotificationPreferences: usePrefsMock,
  useUpdateNotificationPreferences: () => ({
    mutate: updateMutate,
    isPending: updateStateRef.isPending,
  }),
}));

/** Per-call callbacks the panel hands to `mutate` (TanStack `mutateOptions`). */
type MutateCallbacks = { onSuccess?: () => void; onError?: () => void };

/** The callbacks from the Nth `mutate` call. */
function callbacksOf(call = 0): MutateCallbacks {
  // `call` is a literal test index into this suite's own mock, never user input.
  // eslint-disable-next-line security/detect-object-injection -- test-local index
  return (updateMutate.mock.calls[call]?.[1] ?? {}) as MutateCallbacks;
}
vi.mock('@/shared/notifications/desktop.ts', () => ({
  requestDesktopPermission: requestPermissionMock,
}));

import { AccountNotificationsPanel } from './AccountNotificationsPanel.tsx';

beforeEach(() => {
  vi.clearAllMocks();
  usePrefsMock.mockReturnValue({
    data: DEFAULT_NOTIFICATION_PREFERENCES,
    isLoading: false,
    isError: false,
  });
  requestPermissionMock.mockResolvedValue('granted');
  updateStateRef.isPending = false;
});

describe('AccountNotificationsPanel', () => {
  it('renders the category × channel matrix', () => {
    render(<AccountNotificationsPanel />);
    expect(screen.getByTestId('settings-section-notifications')).toBeInTheDocument();
    expect(screen.getByTestId('notify-system-email')).toBeInTheDocument();
    expect(screen.getByTestId('notify-billing-desktop')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    usePrefsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<AccountNotificationsPanel />);
    expect(screen.getByTestId('notifications-prefs-loading')).toBeInTheDocument();
  });

  it('saves on toggle (full-replace) with the changed preference', async () => {
    const user = userEvent.setup();
    render(<AccountNotificationsPanel />);
    // system/email defaults on → toggling turns it off
    await user.click(screen.getByTestId('notify-system-email'));
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    const saved = updateMutate.mock.calls[0][0] as Array<{
      category: string;
      channel: string;
      enabled: boolean;
    }>;
    expect(saved).toContainEqual({
      category: 'system',
      channel: 'email',
      enabled: false,
    });
  });

  it('asks for OS permission before enabling desktop, then saves when granted', async () => {
    requestPermissionMock.mockResolvedValue('granted');
    const user = userEvent.setup();
    render(<AccountNotificationsPanel />);
    await user.click(screen.getByTestId('notify-system-desktop'));
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      // Second arg = the per-call onSuccess/onError the panel now attaches.
      expect(updateMutate).toHaveBeenCalledWith(
        expect.arrayContaining([
          { category: 'system', channel: 'desktop', enabled: true },
        ]),
        expect.any(Object),
      ),
    );
  });

  it('does not enable desktop (or save) when permission is denied', async () => {
    requestPermissionMock.mockResolvedValue('denied');
    const user = userEvent.setup();
    render(<AccountNotificationsPanel />);
    await user.click(screen.getByTestId('notify-system-desktop'));
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(updateMutate).not.toHaveBeenCalled();
  });

  // ── SET-1: the local override must never outlive the request ──────────────

  it('reverts the switch when the save fails', async () => {
    // Regression: the override was written on click and never reverted, so a
    // failed save left the toggle switched on forever — the user believed the
    // preference was stored, and the local map shadowed server truth for the
    // rest of the session.
    const user = userEvent.setup();
    render(<AccountNotificationsPanel />);
    const toggle = screen.getByTestId('notify-system-email');
    expect(toggle).toBeChecked(); // server says on

    await user.click(toggle);
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(toggle).not.toBeChecked(); // optimistic: shows the user's edit

    act(() => callbacksOf().onError?.());

    // Back to what the server actually holds — not the edit that never landed.
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('stops shadowing server truth once the save succeeds', async () => {
    // After a successful save the query cache holds the saved matrix, so the
    // override has to go. Left behind it paints over every later refetch for the
    // rest of the session — the switch stops following the server entirely.
    const offMatrix = DEFAULT_NOTIFICATION_PREFERENCES.map((p) =>
      p.category === 'system' && p.channel === 'email' ? { ...p, enabled: false } : p,
    );
    const user = userEvent.setup();
    const { rerender } = render(<AccountNotificationsPanel />);
    const toggle = screen.getByTestId('notify-system-email');

    await user.click(toggle);
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));

    // The server commits the change; the cache now reports it off.
    usePrefsMock.mockReturnValue({ data: offMatrix, isLoading: false, isError: false });
    act(() => callbacksOf().onSuccess?.());
    rerender(<AccountNotificationsPanel />);
    await waitFor(() => expect(toggle).not.toBeChecked());

    // Server truth flips back — another device, or any later refetch. The same
    // mounted panel must follow it. A leftover override cannot be overtaken.
    usePrefsMock.mockReturnValue({
      data: DEFAULT_NOTIFICATION_PREFERENCES,
      isLoading: false,
      isError: false,
    });
    rerender(<AccountNotificationsPanel />);
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('disables the grid while a save is in flight', async () => {
    updateStateRef.isPending = true;
    render(<AccountNotificationsPanel />);
    expect(screen.getByTestId('notify-system-email')).toBeDisabled();
    expect(screen.getByTestId('notify-billing-desktop')).toBeDisabled();
  });

  it('drops a second flick fired in the same frame as the first', async () => {
    // `isPending` only disables the switches after React re-renders. Both clicks
    // are dispatched inside one act() batch to reproduce that live frame: the
    // second would paint an override whose write never goes out, because
    // useAppMutation joins the in-flight request instead of sending the new
    // matrix.
    render(<AccountNotificationsPanel />);
    const first = screen.getByTestId('notify-system-email');
    const second = screen.getByTestId('notify-system-inApp');

    await act(async () => {
      first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      second.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(updateMutate).toHaveBeenCalledTimes(1);
    // The dropped flick left no phantom override behind either.
    expect(second).toBeChecked();
  });

  // ── SET-20: the same failure surface as every other panel ────────────────

  it('offers a retry when the preferences fetch fails', async () => {
    const refetch = vi.fn();
    const user = userEvent.setup();
    usePrefsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    });
    render(<AccountNotificationsPanel />);

    expect(screen.getByTestId('notification-prefs-error')).toBeInTheDocument();
    await user.click(screen.getByTestId('retry-button'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // ── SET-22: one skeleton block per real category ─────────────────────────

  it('renders one skeleton block per category, in the row shell', () => {
    // Regression: four 48px bars for rows that are ~3x taller — the card grew
    // under the user when the preferences landed.
    usePrefsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<AccountNotificationsPanel />);

    const loading = container.querySelector(
      '[data-testid="notifications-prefs-loading"]',
    );
    expect(loading).not.toBeNull();
    expect(loading?.className).toContain('divide-y');
    // One block per category, in the same `py-4` shell the loaded rows use.
    const blocks = container.querySelectorAll(
      '[data-testid="notifications-prefs-loading"] > div',
    );
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]?.className).toContain('py-4');
  });
});
