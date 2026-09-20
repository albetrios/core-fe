import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { SessionTimeoutDialog } from './SessionTimeoutDialog.tsx';

/**
 * The dialog wired to the REAL idle timer.
 *
 * `SessionTimeoutDialog.test.tsx` mocks `startIdleTimeout`, which is exactly why
 * it could not see the reported bug: that bug lived BETWEEN the two modules. The
 * timer listens for activity on `document`, the dialog's buttons are inside
 * `document`, and a press on "Sign out" was therefore "the user is back" — the
 * warning ended on `mousedown` and the `click` never arrived.
 */
const { logoutMock, forceLogoutMock } = vi.hoisted(() => ({
  logoutMock: vi.fn((_opts?: { reason?: string }) => Promise.resolve()),
  forceLogoutMock: vi.fn(),
}));
vi.mock('@/shared/auth/service.ts', () => ({
  logout: logoutMock,
  forceLogout: forceLogoutMock,
}));

const WARN_AFTER_MS = 5 * 60 * 1000;
const GRACE_MS = 90 * 1000;

async function renderAndIdleUntilWarned() {
  renderWithProviders(<SessionTimeoutDialog />);
  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    vi.advanceTimersByTime(WARN_AFTER_MS);
  });
  return screen.getByTestId('session-timeout-dialog');
}

/**
 * A real pointer press. In a browser `mousedown`, `mouseup` and `click` are
 * separate tasks and React commits between them — so each half gets its own
 * `act()` and re-queries the button. Fired inside ONE `act()` the click would
 * still find a dialog that a real browser had already unmounted, and these
 * tests would pass against the very bug they exist for.
 */
function press(testId: string) {
  act(() => {
    fireEvent.mouseDown(screen.getByTestId(testId));
  });
  act(() => {
    fireEvent.mouseUp(screen.getByTestId(testId));
  });
  act(() => {
    fireEvent.click(screen.getByTestId(testId));
  });
}

describe('SessionTimeoutDialog — signing out after inactivity (real idle timer)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
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
    vi.useRealTimers();
    localStorage.clear();
  });

  it('opens after five idle minutes', async () => {
    const dialog = await renderAndIdleUntilWarned();

    expect(dialog).toBeVisible();
    expect(dialog).toHaveTextContent('1:30');
  });

  it('a mouse press on "Sign out" signs the user out', async () => {
    await renderAndIdleUntilWarned();

    press('session-signout');

    expect(logoutMock).toHaveBeenCalledExactlyOnceWith({ reason: 'logout' });
  });

  it('the press does not dismiss the dialog out from under the pointer', async () => {
    await renderAndIdleUntilWarned();

    // The half of the gesture that used to close it.
    act(() => {
      fireEvent.mouseDown(screen.getByTestId('session-signout'));
    });

    expect(screen.getByTestId('session-timeout-dialog')).toBeVisible();
    expect(screen.getByTestId('session-signout')).toBeEnabled();
  });

  it('the keyboard can reach and press "Sign out" without dismissing the dialog', async () => {
    await renderAndIdleUntilWarned();

    // Tab is a keydown on `document` too — it used to end the warning before
    // Enter could be pressed.
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab' });
    });
    act(() => {
      screen.getByTestId('session-signout').focus();
      fireEvent.keyDown(screen.getByTestId('session-signout'), { key: 'Enter' });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('session-signout'));
    });

    expect(logoutMock).toHaveBeenCalledExactlyOnceWith({ reason: 'logout' });
  });

  it('a touch on "Sign out" signs the user out', async () => {
    await renderAndIdleUntilWarned();

    // Radix's scroll lock reads the touch point, so the event needs one.
    const point = { clientX: 10, clientY: 10 };
    act(() => {
      fireEvent.touchStart(screen.getByTestId('session-signout'), {
        touches: [point],
        changedTouches: [point],
      });
    });
    act(() => {
      fireEvent.touchEnd(screen.getByTestId('session-signout'), {
        touches: [],
        changedTouches: [point],
      });
    });
    act(() => {
      fireEvent.click(screen.getByTestId('session-signout'));
    });

    expect(logoutMock).toHaveBeenCalledExactlyOnceWith({ reason: 'logout' });
  });

  it('signs out by itself when the grace period runs out', async () => {
    await renderAndIdleUntilWarned();

    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });

    expect(logoutMock).toHaveBeenCalledExactlyOnceWith({ reason: 'idle_timeout' });
    // Still up and inert until the redirect unloads the page.
    expect(screen.getByTestId('session-timeout-dialog')).toBeVisible();
    expect(screen.getByTestId('session-stay')).toBeDisabled();
  });

  it('"Stay signed in" buys a full new idle period', async () => {
    await renderAndIdleUntilWarned();

    press('session-stay');
    expect(screen.queryByTestId('session-timeout-dialog')).not.toBeInTheDocument();

    // The old deadline passes without a sign-out…
    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });
    expect(logoutMock).not.toHaveBeenCalled();

    // …and the warning returns once a whole idle period has gone by again.
    act(() => {
      vi.advanceTimersByTime(WARN_AFTER_MS - GRACE_MS);
    });
    expect(screen.getByTestId('session-timeout-dialog')).toBeVisible();
  });

  it('never opens while the user keeps working', async () => {
    renderWithProviders(<SessionTimeoutDialog />);
    await act(async () => {
      await Promise.resolve();
    });

    for (let minute = 0; minute < 12; minute += 1) {
      act(() => {
        vi.advanceTimersByTime(60_000);
        fireEvent.mouseDown(document.body);
      });
    }

    expect(screen.queryByTestId('session-timeout-dialog')).not.toBeInTheDocument();
    expect(logoutMock).not.toHaveBeenCalled();
  });
});
