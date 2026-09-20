import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { SessionTimeoutDialog } from './SessionTimeoutDialog.tsx';

const { startIdleTimeoutMock, idleHandle, logoutMock, forceLogoutMock } = vi.hoisted(
  () => {
    const handle = { extend: vi.fn(), stop: vi.fn() };
    return {
      idleHandle: handle,
      startIdleTimeoutMock: vi.fn((_options: unknown) => handle),
      logoutMock: vi.fn((_opts?: { reason?: string }) => Promise.resolve()),
      forceLogoutMock: vi.fn(),
    };
  },
);
vi.mock('@/shared/auth/idle-timeout.ts', () => ({
  startIdleTimeout: startIdleTimeoutMock,
}));

/** Grace period the dialog configures: warn at 5:00, sign out at 6:30. */
const GRACE_MS = 90_000;

/** The options the dialog handed the idle timer on its last mount. */
function idleOptions() {
  const options = startIdleTimeoutMock.mock.calls.at(-1)?.[0] as
    | {
        onWarn: (info: { logoutAt: number }) => void;
        onActive: () => void;
        onLogout: () => void;
        storageKey?: string;
      }
    | undefined;
  if (!options) throw new Error('startIdleTimeout was never called');
  return options;
}

/** Enter the warning the way the idle timer does — with its logout deadline. */
function warn() {
  idleOptions().onWarn({ logoutAt: Date.now() + GRACE_MS });
}

function dialogText() {
  return screen.getByTestId('session-timeout-dialog').textContent ?? '';
}

/**
 * Render and let the router settle. Under fake timers the initial route match
 * resolves on a microtask, and until it does the dialog has not mounted — so
 * its idle-timeout registration has not happened either.
 */
async function renderDialog() {
  const utils = renderWithProviders(<SessionTimeoutDialog />);
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

vi.mock('@/shared/auth/service.ts', () => ({
  logout: logoutMock,
  forceLogout: forceLogoutMock,
}));

describe('SessionTimeoutDialog', () => {
  beforeEach(() => {
    useAuthStore.getState().setUser({
      id: 'test-user',
      email: 'test@example.com',
      role: 'user',
      organizationId: 't1',
      name: 'Test User',
    });
  });

  afterEach(() => {
    useAuthStore.getState().clearAuth();
    vi.clearAllMocks();
  });

  it('renders when not shown (open=false)', () => {
    const { container } = renderWithProviders(<SessionTimeoutDialog />);
    expect(container).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<SessionTimeoutDialog />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('calls startIdleTimeout when authenticated', async () => {
    const { startIdleTimeout } = await import('@/shared/auth/idle-timeout.ts');
    renderWithProviders(<SessionTimeoutDialog />);
    await waitFor(() => {
      expect(startIdleTimeout).toHaveBeenCalledWith(
        expect.objectContaining({
          warnAfterMs: 5 * 60 * 1000,
        }),
      );
    });
  });

  it('stops the idle timer on unmount', async () => {
    const { unmount } = await renderDialog();
    expect(idleHandle.stop).not.toHaveBeenCalled();

    unmount();

    expect(idleHandle.stop).toHaveBeenCalled();
  });

  it('shares activity across tabs through a namespaced storage key', async () => {
    // Without it the timer is per tab while the session is per browser: a tab
    // left in the background signs the user out of the one they are working in.
    await renderDialog();

    expect(idleOptions().storageKey).toBe('core:last-activity');
  });

  // ── The reported bug: "after inactivity, popup sign out doesn't work" ─────

  describe('ending the session', () => {
    it('Sign out revokes the session server-side — never forceLogout alone', async () => {
      // Regression: the button called forceLogout(), which only clears THIS
      // tab. The HttpOnly refresh cookie stayed valid, so /login booted, the
      // silent refresh succeeded, and the guest-only guard sent the user
      // straight back to the dashboard.
      await renderDialog();
      act(() => warn());

      await userEvent.click(screen.getByTestId('session-signout'));

      expect(logoutMock).toHaveBeenCalledExactlyOnceWith({ reason: 'logout' });
      expect(forceLogoutMock).not.toHaveBeenCalled();
    });

    it('the idle deadline revokes server-side too, labelled idle_timeout', async () => {
      await renderDialog();
      act(() => warn());

      act(() => idleOptions().onLogout());

      expect(logoutMock).toHaveBeenCalledExactlyOnceWith({ reason: 'idle_timeout' });
      expect(forceLogoutMock).not.toHaveBeenCalled();
    });

    it('holds the dialog open, busy and inert while the revoke is in flight', async () => {
      // Closing on the press would hand the app back for a network round trip
      // with a session that is being torn down underneath it.
      let finish: () => void = () => undefined;
      logoutMock.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      await renderDialog();
      act(() => warn());

      await userEvent.click(screen.getByTestId('session-signout'));

      const dialog = screen.getByTestId('session-timeout-dialog');
      expect(dialog).toBeVisible();
      expect(dialog).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('session-signout')).toBeDisabled();
      expect(screen.getByTestId('session-signout')).toHaveTextContent('Signing out…');
      expect(screen.getByTestId('session-stay')).toBeDisabled();
      expect(dialogText()).toContain('Ending your session securely');
      finish();
    });

    it('signs out once when the button and the deadline land together', async () => {
      await renderDialog();
      act(() => warn());

      await userEvent.click(screen.getByTestId('session-signout'));
      act(() => idleOptions().onLogout());

      expect(logoutMock).toHaveBeenCalledOnce();
      expect(idleHandle.stop).toHaveBeenCalled();
    });

    it('falls back to a local sign-out if the revoke itself throws', async () => {
      // Both buttons are disabled by now — a rejected logout() must not strand
      // the user behind a dialog nothing can close.
      logoutMock.mockRejectedValueOnce(new Error('boom'));
      await renderDialog();
      act(() => warn());

      await userEvent.click(screen.getByTestId('session-signout'));

      await waitFor(() =>
        expect(forceLogoutMock).toHaveBeenCalledExactlyOnceWith({ reason: 'logout' }),
      );
    });
  });

  describe('staying signed in', () => {
    it('extends the idle timer explicitly and closes the dialog', async () => {
      // Activity in this tab is ignored while the warning is up, so nothing but
      // this call restarts the clock.
      await renderDialog();
      act(() => warn());

      await userEvent.click(screen.getByTestId('session-stay'));

      expect(idleHandle.extend).toHaveBeenCalledOnce();
      expect(logoutMock).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.queryByTestId('session-timeout-dialog')).not.toBeInTheDocument(),
      );
    });

    it('puts keyboard focus on "Stay signed in", not on "Sign out"', async () => {
      // Radix focuses the first tabbable element, which is "Sign out": Space or
      // Enter to wake the screen would sign the user out.
      await renderDialog();
      act(() => warn());

      await waitFor(() => expect(screen.getByTestId('session-stay')).toHaveFocus());
    });

    it('closes when another tab shows the user is active', async () => {
      await renderDialog();
      act(() => warn());
      expect(screen.getByTestId('session-timeout-dialog')).toBeVisible();

      act(() => idleOptions().onActive());

      await waitFor(() =>
        expect(screen.queryByTestId('session-timeout-dialog')).not.toBeInTheDocument(),
      );
      expect(logoutMock).not.toHaveBeenCalled();
    });
  });

  // ── SET-16: one interval, anchored to the deadline ───────────────────────

  describe('countdown', () => {
    let setIntervalSpy: ReturnType<typeof vi.spyOn>;
    let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.useFakeTimers();
      setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
      clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    });
    afterEach(() => {
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
      vi.useRealTimers();
    });

    /** Timers this component schedules — the countdown ticks once a second. */
    const countdownTicks = () =>
      setIntervalSpy.mock.calls.filter((call) => call[1] === 1000).length;

    /** The id of the most recently started countdown interval. */
    function currentCountdownId() {
      for (let i = setIntervalSpy.mock.calls.length - 1; i >= 0; i -= 1) {
        if (setIntervalSpy.mock.calls[i]?.[1] === 1000) {
          return setIntervalSpy.mock.results[i]?.value;
        }
      }
      return undefined;
    }

    it('clears the running countdown before starting another', async () => {
      // Regression: startCountdown did not clear a prior interval, so a second
      // warn left the first one ticking for the tab's lifetime — two timers
      // counting the same number down at double speed.
      await renderDialog();

      act(() => warn());
      expect(countdownTicks()).toBe(1);
      const first = currentCountdownId();

      act(() => warn());
      expect(countdownTicks()).toBe(2);
      expect(clearIntervalSpy).toHaveBeenCalledWith(first);
    });

    it('clears its interval when the user goes active again', async () => {
      await renderDialog();
      const { onActive } = idleOptions();

      act(() => warn());
      const id = currentCountdownId();

      act(() => onActive());
      expect(clearIntervalSpy).toHaveBeenCalledWith(id);
    });

    it('reads the countdown off the clock, not off the tick count', async () => {
      // A throttled background tab gets roughly one tick a minute, so a counter
      // that subtracts one per tick drifts away from the moment logout fires.
      await renderDialog();
      act(() => warn());
      expect(dialogText()).toContain('1:30');

      // 30 seconds of wall clock, one interval tick.
      act(() => {
        vi.setSystemTime(Date.now() + 30_000);
        vi.advanceTimersByTime(1000);
      });

      expect(dialogText()).toContain('0:59');
    });

    it('stops at zero instead of running past the deadline', async () => {
      await renderDialog();
      act(() => warn());
      const id = currentCountdownId();

      act(() => {
        vi.setSystemTime(Date.now() + 91_000);
        vi.advanceTimersByTime(1000);
      });

      expect(dialogText()).toContain('0:00');
      expect(clearIntervalSpy).toHaveBeenCalledWith(id);
    });

    it('counts down to the deadline the idle timer gave it, not to its own', async () => {
      // Waking inside the warning window leaves LESS than the full grace. A
      // dialog that started its own 90s here would still read 1:30 at the
      // moment the timer signed the user out.
      await renderDialog();

      act(() => idleOptions().onWarn({ logoutAt: Date.now() + 20_000 }));

      expect(dialogText()).toContain('0:20');
    });
  });
});
