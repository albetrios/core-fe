import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';

import { SessionTimeoutDialog } from './SessionTimeoutDialog.tsx';

type IdleOpts = {
  warnAfterMs: number;
  logoutAfterMs: number;
  onWarn: () => void;
  onLogout: () => void;
  onActive: () => void;
};

const mocks = vi.hoisted(() => ({
  idleOpts: { current: null as IdleOpts | null },
  idleCleanup: vi.fn(),
  lifetimeCb: { current: null as (() => void) | null },
  lifetimeStop: vi.fn(),
  startIdleTimeout: vi.fn(),
  startSessionLifetimeWatch: vi.fn(),
  forceLogout: vi.fn(),
}));

vi.mock('@/shared/auth/idle-timeout.ts', () => ({
  startIdleTimeout: mocks.startIdleTimeout.mockImplementation((opts: IdleOpts) => {
    mocks.idleOpts.current = opts;
    return mocks.idleCleanup;
  }),
}));
vi.mock('@/shared/auth/session-lifetime.ts', () => ({
  startSessionLifetimeWatch: mocks.startSessionLifetimeWatch.mockImplementation(
    (cb: () => void) => {
      mocks.lifetimeCb.current = cb;
      return mocks.lifetimeStop;
    },
  ),
}));
vi.mock('@/shared/auth/service.ts', () => ({
  forceLogout: mocks.forceLogout,
}));

function openWarning() {
  act(() => {
    mocks.idleOpts.current?.onWarn();
  });
}

describe('SessionTimeoutDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.idleOpts.current = null;
    mocks.lifetimeCb.current = null;
    mocks.forceLogout.mockClear();
    mocks.idleCleanup.mockClear();
    mocks.lifetimeStop.mockClear();
    mocks.startIdleTimeout.mockClear();
    useAuthStore.setState({ isAuthenticated: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({ isAuthenticated: false });
  });

  it('does not arm the idle watcher while signed out', () => {
    useAuthStore.setState({ isAuthenticated: false });
    render(<SessionTimeoutDialog />);
    expect(mocks.startIdleTimeout).not.toHaveBeenCalled();
  });

  it('opens on idle warning with the full 1:30 grace countdown', () => {
    render(<SessionTimeoutDialog />);
    expect(screen.queryByTestId('session-timeout-dialog')).not.toBeInTheDocument();

    openWarning();

    expect(screen.getByTestId('session-timeout-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('session-timeout-dialog')).toHaveTextContent('1:30');
  });

  it('ticks the countdown once per second and stops at 0:00', () => {
    render(<SessionTimeoutDialog />);
    openWarning();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('session-timeout-dialog')).toHaveTextContent('1:29');

    // Run past the grace window — the interval self-clears and floors at 0:00.
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(screen.getByTestId('session-timeout-dialog')).toHaveTextContent('0:00');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('"Stay signed in" closes the dialog without logging out', () => {
    render(<SessionTimeoutDialog />);
    openWarning();

    fireEvent.click(screen.getByTestId('session-stay'));

    expect(screen.queryByTestId('session-timeout-dialog')).not.toBeInTheDocument();
    expect(mocks.forceLogout).not.toHaveBeenCalled();
  });

  it('"Sign out" closes the dialog and forces logout', () => {
    render(<SessionTimeoutDialog />);
    openWarning();

    fireEvent.click(screen.getByTestId('session-signout'));

    expect(screen.queryByTestId('session-timeout-dialog')).not.toBeInTheDocument();
    expect(mocks.forceLogout).toHaveBeenCalledTimes(1);
  });

  it('renewed activity closes the warning without logging out', () => {
    render(<SessionTimeoutDialog />);
    openWarning();

    act(() => {
      mocks.idleOpts.current?.onActive();
    });

    expect(screen.queryByTestId('session-timeout-dialog')).not.toBeInTheDocument();
    expect(mocks.forceLogout).not.toHaveBeenCalled();
  });

  it('idle expiry forces logout and closes the dialog', () => {
    render(<SessionTimeoutDialog />);
    openWarning();

    act(() => {
      mocks.idleOpts.current?.onLogout();
    });

    expect(screen.queryByTestId('session-timeout-dialog')).not.toBeInTheDocument();
    expect(mocks.forceLogout).toHaveBeenCalledTimes(1);
  });

  it('session-lifetime expiry forces logout even without idling', () => {
    render(<SessionTimeoutDialog />);

    act(() => {
      mocks.lifetimeCb.current?.();
    });

    expect(mocks.forceLogout).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility violations', async () => {
    vi.useRealTimers();
    const { container } = render(<SessionTimeoutDialog />);
    openWarning();
    expect(await axe(container)).toHaveNoViolations();
    vi.useFakeTimers();
  });

  it('unmount tears down the idle watcher, lifetime watch, and countdown', () => {
    const { unmount } = render(<SessionTimeoutDialog />);
    openWarning();

    const before = vi.getTimerCount();
    unmount();

    expect(mocks.idleCleanup).toHaveBeenCalledTimes(1);
    expect(mocks.lifetimeStop).toHaveBeenCalledTimes(1);
    // The 1s countdown interval is gone (radix may keep its own focus timer).
    expect(vi.getTimerCount()).toBeLessThan(before);
  });
});
