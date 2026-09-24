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
  return (updateMutate.mock.calls[call]?.[1] ?? {}) as MutateCallbacks;
}
vi.mock('@/shared/notifications/desktop.ts', () => ({
  requestDesktopPermission: requestPermissionMock,
}));

/**
 * Leave the OS permission prompt open and hand back its answer button. The
 * panel is parked on this await for as long as the test likes — which is the
 * window the race lives in.
 */
function openPermissionPrompt(): (permission: string) => void {
  let answer: (permission: string) => void = (_permission) => undefined;
  requestPermissionMock.mockReturnValue(
    new Promise<string>((resolve) => {
      answer = resolve;
    }),
  );
  return (permission) => answer(permission);
}

import { AccountNotificationsPanel } from './AccountNotificationsPanel.tsx';

beforeEach(() => {
  vi.resetAllMocks();
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
    expect(screen.queryByTestId('notify-system-email')).not.toBeInTheDocument();
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

  // ── the OS permission prompt is an await the save latch has to cover ─────

  it('refuses a flick fired while the desktop permission prompt is open', async () => {
    // Regression: the latch was CHECKED at entry but only SET after
    // `requestDesktopPermission()` resolved, so the grid stayed unguarded for as
    // long as the OS prompt was open. A flick landing in that window passed the
    // check and sent its own full-replace matrix, and the desktop continuation
    // then resumed on a pre-prompt snapshot — rebuilding the matrix WITHOUT that
    // edit and reverting it on the server, or (with the save still in flight)
    // racing it with a second full-replace the mutation layer may join and
    // discard rather than send, leaving its override painted on a switch the
    // server never heard about.
    const grantPermission = openPermissionPrompt();
    const user = userEvent.setup();
    render(<AccountNotificationsPanel />);
    const desktop = screen.getByTestId('notify-system-desktop');
    const email = screen.getByTestId('notify-system-email');

    // The prompt is open and this toggle is parked on it.
    await user.click(desktop);
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);

    // The flick in between. No write may leave while the prompt is open …
    await user.click(email);
    expect(updateMutate).not.toHaveBeenCalled();
    // … and nothing may be claimed locally for a write that never left.
    expect(email).toBeChecked();

    await act(async () => {
      grantPermission('granted');
    });

    // Exactly one save — the desktop one — and it carries the edit the user
    // actually made rather than being swallowed by the latch.
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const saved = updateMutate.mock.calls[0][0] as Array<{
      category: string;
      channel: string;
      enabled: boolean;
    }>;
    expect(saved).toContainEqual({
      category: 'system',
      channel: 'desktop',
      enabled: true,
    });
    // The email preference is carried through as the server still holds it —
    // not rewritten by a matrix assembled before the prompt opened.
    expect(saved).toContainEqual({
      category: 'system',
      channel: 'email',
      enabled: true,
    });
    expect(email).toBeChecked();
  });

  it('builds the resumed desktop save from server truth as it stands after the prompt', async () => {
    // The prompt outlives a refetch: another device — or the next poll — can
    // land a new matrix while the user is still deciding. The API is a FULL
    // REPLACE, so a payload assembled from the pre-prompt snapshot pushes every
    // one of those preferences back to how it looked before the prompt opened,
    // and the email switch that was just turned off flips back on when the
    // seeded cache comes through.
    const grantPermission = openPermissionPrompt();
    const emailOff = DEFAULT_NOTIFICATION_PREFERENCES.map((p) =>
      p.category === 'system' && p.channel === 'email' ? { ...p, enabled: false } : p,
    );
    const user = userEvent.setup();
    const { rerender } = render(<AccountNotificationsPanel />);

    await user.click(screen.getByTestId('notify-system-desktop'));
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);

    // Server truth moves while the prompt is still open.
    usePrefsMock.mockReturnValue({ data: emailOff, isLoading: false, isError: false });
    rerender(<AccountNotificationsPanel />);

    await act(async () => {
      grantPermission('granted');
    });

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const saved = updateMutate.mock.calls[0][0] as Array<{
      category: string;
      channel: string;
      enabled: boolean;
    }>;
    expect(saved).toContainEqual({
      category: 'system',
      channel: 'desktop',
      enabled: true,
    });
    // Carried through as the server now holds it — not reverted to the value it
    // had when the prompt opened.
    expect(saved).toContainEqual({
      category: 'system',
      channel: 'email',
      enabled: false,
    });
  });

  it('releases the save latch when the permission prompt is refused', async () => {
    // The latch is now claimed BEFORE the prompt, so every way out of the prompt
    // has to drop it. One that only unwinds on the paths that happen to be
    // exercised leaves the whole grid dead — every later flick returns at the
    // guard and the panel silently stops saving until it remounts.
    requestPermissionMock.mockResolvedValue('denied');
    const user = userEvent.setup();
    render(<AccountNotificationsPanel />);

    await user.click(screen.getByTestId('notify-system-desktop'));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(updateMutate).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('notify-system-email'));
    expect(updateMutate).toHaveBeenCalledTimes(1);
  });

  it('releases the save latch when the permission request rejects', async () => {
    // Same latch, the path that throws. `requestDesktopPermission` swallows its
    // own failures today, so only an unwind that covers the throw keeps this
    // panel alive if that ever stops being true.
    requestPermissionMock.mockRejectedValue(new Error('permission prompt failed'));
    const user = userEvent.setup();
    render(<AccountNotificationsPanel />);

    await user.click(screen.getByTestId('notify-system-desktop'));
    await waitFor(() => expect(requestPermissionMock).toHaveBeenCalledTimes(1));
    expect(updateMutate).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('notify-system-email'));
    expect(updateMutate).toHaveBeenCalledTimes(1);
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

  it('draws one skeleton with no visible copy, not a block per category', () => {
    // Superseded SET-22: the loading block used to mirror the real rows so the
    // card would not grow when preferences landed. It now draws the SAME single
    // skeleton every other settings wait draws — the reflow when content lands
    // is the accepted cost of a click producing one loading state instead of a
    // shell skeleton, then a category-shaped one, then content.
    usePrefsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<AccountNotificationsPanel />);

    const loading = container.querySelector(
      '[data-testid="notifications-prefs-loading"]',
    );
    expect(loading).not.toBeNull();
    const clone = loading?.cloneNode(true) as HTMLElement;
    for (const srOnly of clone.querySelectorAll('.sr-only')) srOnly.remove();
    expect(clone.textContent?.trim()).toBe('');
  });
});
