import { vi } from 'vitest';

import { startIdleTimeout } from './idle-timeout.ts';

const WARN = 5000;
const LOGOUT = 10_000;
const KEY = 'test:last-activity';

function start(overrides: Partial<Parameters<typeof startIdleTimeout>[0]> = {}) {
  const onWarn = vi.fn();
  const onLogout = vi.fn();
  const onActive = vi.fn();
  const handle = startIdleTimeout({
    warnAfterMs: WARN,
    logoutAfterMs: LOGOUT,
    onWarn,
    onLogout,
    onActive,
    ...overrides,
  });
  return { handle, onWarn, onLogout, onActive };
}

/** Another tab recorded activity: it wrote the shared key and we got the event. */
function activityInAnotherTab(at: number) {
  localStorage.setItem(KEY, String(at));
  window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: String(at) }));
}

describe('idle-timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('calls onWarn after warnAfterMs of idle time', () => {
    const { onWarn, onLogout } = start();

    expect(onWarn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(WARN);
    expect(onWarn).toHaveBeenCalledOnce();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('hands onWarn the wall-clock logout deadline', () => {
    const startedAt = Date.now();
    const { onWarn } = start();

    vi.advanceTimersByTime(WARN);

    expect(onWarn).toHaveBeenCalledWith({ logoutAt: startedAt + LOGOUT });
  });

  it('calls onLogout exactly once after logoutAfterMs of idle time', () => {
    const { onLogout } = start();

    vi.advanceTimersByTime(LOGOUT);
    expect(onLogout).toHaveBeenCalledOnce();

    // Nothing may fire it a second time — not a late timer, not a focus event.
    vi.advanceTimersByTime(LOGOUT * 3);
    window.dispatchEvent(new Event('focus'));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('stop() clears timers and prevents callbacks', () => {
    const { handle, onWarn, onLogout } = start();

    handle.stop();
    vi.advanceTimersByTime(LOGOUT * 2);

    expect(onWarn).not.toHaveBeenCalled();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('restarts the clock on activity before the warning', () => {
    const { onWarn } = start({ warnAfterMs: 20_000, logoutAfterMs: 30_000 });

    // Past the 10s throttle, so this press counts.
    vi.advanceTimersByTime(15_000);
    document.dispatchEvent(new Event('mousedown'));

    // 15s + 15s = 30s since mount, but only 15s since the press.
    vi.advanceTimersByTime(15_000);
    expect(onWarn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(onWarn).toHaveBeenCalledOnce();
  });

  // ── The sign-out bug: the warning used to be dismissed by the very press that
  //    was trying to answer it ──────────────────────────────────────────────

  describe('while the warning is showing', () => {
    it.each(['mousedown', 'click', 'keydown', 'touchstart'] as const)(
      'ignores %s in this tab — it must not dismiss the warning',
      (type) => {
        // Regression: the listeners sit on `document`, so a press on the dialog's
        // own "Sign out" button counted as "the user is back". The warning ended
        // on mousedown, the dialog closed under the pointer, and the click never
        // landed. Tab + Enter from the keyboard died the same way.
        const { onWarn, onActive, onLogout } = start({
          warnAfterMs: 20_000,
          logoutAfterMs: 40_000,
        });
        vi.advanceTimersByTime(20_000);
        expect(onWarn).toHaveBeenCalledOnce();

        document.dispatchEvent(new Event(type));

        expect(onActive).not.toHaveBeenCalled();
        // …and it did not quietly buy more time either: the deadline stands.
        vi.advanceTimersByTime(20_000);
        expect(onLogout).toHaveBeenCalledOnce();
      },
    );

    it('extend() ends the warning and restarts the clock', () => {
      const { handle, onWarn, onLogout } = start();
      vi.advanceTimersByTime(WARN);
      expect(onWarn).toHaveBeenCalledOnce();

      handle.extend();

      // A full idle period is available again…
      vi.advanceTimersByTime(WARN - 1);
      expect(onWarn).toHaveBeenCalledOnce();
      expect(onLogout).not.toHaveBeenCalled();
      // …and the warning comes back at the end of it.
      vi.advanceTimersByTime(1);
      expect(onWarn).toHaveBeenCalledTimes(2);
    });

    it('extend() does not report onActive — the caller made the choice itself', () => {
      const { handle, onActive } = start();
      vi.advanceTimersByTime(WARN);

      handle.extend();

      expect(onActive).not.toHaveBeenCalled();
    });

    it('extend() after stop() is a no-op', () => {
      const { handle, onWarn } = start();
      handle.stop();

      handle.extend();
      vi.advanceTimersByTime(LOGOUT * 2);

      expect(onWarn).not.toHaveBeenCalled();
    });
  });

  // ── Idle time is wall-clock time ─────────────────────────────────────────

  describe('wall-clock anchoring', () => {
    it('signs out at once when the machine wakes past the deadline', () => {
      // A sleeping laptop runs no timers. On wake the clock has jumped but the
      // warn timer has not fired — offering a fresh 90s grace period here would
      // leave a session open for hours on an unattended machine.
      const { onWarn, onLogout } = start();

      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
      document.dispatchEvent(new Event('visibilitychange'));

      expect(onLogout).toHaveBeenCalledOnce();
      expect(onWarn).not.toHaveBeenCalled();
    });

    it('warns with the REMAINING grace when it wakes inside the warning window', () => {
      const startedAt = Date.now();
      const { onWarn, onLogout } = start();

      vi.setSystemTime(startedAt + 8000);
      window.dispatchEvent(new Event('focus'));

      expect(onWarn).toHaveBeenCalledWith({ logoutAt: startedAt + LOGOUT });
      expect(onLogout).not.toHaveBeenCalled();
      // 2s of the original deadline are left — not a new 5s.
      vi.advanceTimersByTime(2000);
      expect(onLogout).toHaveBeenCalledOnce();
    });

    it('does not warn twice when re-evaluated during the warning', () => {
      const { onWarn } = start();
      vi.advanceTimersByTime(WARN);

      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));

      expect(onWarn).toHaveBeenCalledOnce();
    });
  });

  // ── One session, many tabs ───────────────────────────────────────────────

  describe('cross-tab activity (storageKey)', () => {
    it('publishes activity for sibling tabs', () => {
      start({ storageKey: KEY });

      expect(localStorage.getItem(KEY)).toBe(String(Date.now()));
    });

    it('stays quiet while the user is active in another tab', () => {
      // Regression: the timer is per tab but the session is per browser. A tab
      // left in the background counted itself idle and signed the user out of
      // the tab they were working in.
      const { onWarn, onLogout } = start({ storageKey: KEY });

      vi.advanceTimersByTime(4000);
      activityInAnotherTab(Date.now());
      vi.advanceTimersByTime(4000);

      expect(onWarn).not.toHaveBeenCalled();
      expect(onLogout).not.toHaveBeenCalled();
    });

    it('reads the shared clock at the deadline even if no storage event arrived', () => {
      // Background tabs get their events late. The decision must not depend on
      // delivery order: re-read the key at the moment of deciding.
      const { onWarn } = start({ storageKey: KEY });

      vi.advanceTimersByTime(4000);
      localStorage.setItem(KEY, String(Date.now())); // no StorageEvent dispatched
      vi.advanceTimersByTime(1000);

      expect(onWarn).not.toHaveBeenCalled();
    });

    it('calls onActive when another tab shows the user is back during the warning', () => {
      const { onWarn, onActive, onLogout } = start({ storageKey: KEY });
      vi.advanceTimersByTime(WARN);
      expect(onWarn).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(1000);
      activityInAnotherTab(Date.now());

      expect(onActive).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(WARN - 1);
      expect(onLogout).not.toHaveBeenCalled();
    });

    it('ignores a shared timestamp from the future', () => {
      // A skewed or tampered value must not be able to keep a session alive.
      const { onWarn } = start({ storageKey: KEY });

      activityInAnotherTab(Date.now() + 24 * 60 * 60 * 1000);
      vi.advanceTimersByTime(WARN);

      expect(onWarn).toHaveBeenCalledOnce();
    });

    it('ignores storage events for unrelated keys', () => {
      const { onWarn } = start({ storageKey: KEY });

      vi.advanceTimersByTime(4000);
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme-preference' }));
      vi.advanceTimersByTime(1000);

      expect(onWarn).toHaveBeenCalledOnce();
    });

    it('stays tab-local without a storageKey', () => {
      start();

      expect(localStorage).toHaveLength(0);
    });

    it('survives unavailable storage', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      const { onWarn } = start({ storageKey: KEY });
      vi.advanceTimersByTime(WARN);

      expect(onWarn).toHaveBeenCalledOnce();
      setItem.mockRestore();
      getItem.mockRestore();
    });
  });
});
