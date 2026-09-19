import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { SessionTimeoutDialog } from './SessionTimeoutDialog.tsx';

const { startIdleTimeoutMock } = vi.hoisted(() => ({
  startIdleTimeoutMock: vi.fn(() => vi.fn()),
}));
vi.mock('@/shared/auth/idle-timeout.ts', () => ({
  startIdleTimeout: startIdleTimeoutMock,
}));

/** The options the dialog handed the idle timer on its last mount. */
function idleOptions() {
  const options = startIdleTimeoutMock.mock.calls.at(-1)?.[0] as unknown as {
    onWarn: () => void;
    onActive: () => void;
  };
  if (!options) throw new Error('startIdleTimeout was never called');
  return options;
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
  forceLogout: vi.fn(),
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

  it('returns cleanup function from startIdleTimeout', async () => {
    const { startIdleTimeout } = await import('@/shared/auth/idle-timeout.ts');
    const { unmount } = renderWithProviders(<SessionTimeoutDialog />);
    await waitFor(() => expect(startIdleTimeout).toHaveBeenCalled());
    const cleanup = vi.mocked(startIdleTimeout).mock.results[0]?.value;
    unmount();
    expect(typeof cleanup).toBe('function');
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
      const { onWarn } = idleOptions();

      act(() => onWarn());
      expect(countdownTicks()).toBe(1);
      const first = currentCountdownId();

      act(() => onWarn());
      expect(countdownTicks()).toBe(2);
      expect(clearIntervalSpy).toHaveBeenCalledWith(first);
    });

    it('clears its interval when the user goes active again', async () => {
      await renderDialog();
      const { onWarn, onActive } = idleOptions();

      act(() => onWarn());
      const id = currentCountdownId();

      act(() => onActive());
      expect(clearIntervalSpy).toHaveBeenCalledWith(id);
    });

    it('reads the countdown off the clock, not off the tick count', async () => {
      // A throttled background tab gets roughly one tick a minute, so a counter
      // that subtracts one per tick drifts away from the moment logout fires.
      await renderDialog();
      act(() => idleOptions().onWarn());
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
      act(() => idleOptions().onWarn());
      const id = currentCountdownId();

      act(() => {
        vi.setSystemTime(Date.now() + 91_000);
        vi.advanceTimersByTime(1000);
      });

      expect(dialogText()).toContain('0:00');
      expect(clearIntervalSpy).toHaveBeenCalledWith(id);
    });
  });
});
