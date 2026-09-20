/**
 * Idle session timeout.
 *
 * Tracks intentional user activity (click, key, touch) and triggers a warning
 * callback once the user has been idle for `warnAfterMs`. From there the user
 * has until `logoutAfterMs` to make an **explicit** choice — {@link
 * IdleTimeoutHandle.extend} ("Stay signed in") or a sign-out — before
 * `onLogout` fires.
 *
 * Three properties this module guarantees, each of which was once a bug:
 *
 * 1. **The warning is not dismissed by activity in this tab.** The activity
 *    listeners sit on `document`, so a press on the warning dialog's own
 *    "Sign out" button IS activity: it used to end the warning on `mousedown`,
 *    the dialog closed under the pointer, and the `click` never landed — the
 *    button could not sign anybody out, by mouse or by keyboard (Tab counts too).
 * 2. **Idle time is wall-clock time.** Timers do not run while a laptop sleeps
 *    and are throttled in background tabs, so every checkpoint re-reads the
 *    clock instead of trusting that "the timer fired" means "the time passed".
 *    A machine that wakes after the deadline is signed out at once, not offered
 *    a fresh grace period.
 * 3. **Activity is shared across tabs** (`storageKey`). The session is one per
 *    browser but the timer is one per tab: without this, a tab left in the
 *    background signs the user out of the tab they are actively working in.
 *
 * Usage:
 *   const idle = startIdleTimeout({
 *     warnAfterMs: 5 * 60 * 1000,
 *     logoutAfterMs: 6.5 * 60 * 1000,
 *     storageKey: 'core:last-activity',
 *     onWarn: ({ logoutAt }) => showWarningDialog(logoutAt),
 *     onLogout: () => logout(),
 *     onActive: () => hideWarningDialog(),
 *   });
 *
 *   idle.extend(); // "Stay signed in"
 *   idle.stop(); // on unmount or logout
 */

interface IdleTimeoutOptions {
  /** Milliseconds of idle time before showing warning */
  warnAfterMs: number;
  /** Milliseconds of idle time before forced logout */
  logoutAfterMs: number;
  /**
   * Called when the idle threshold is reached (show the warning dialog).
   * `logoutAt` is the wall-clock deadline (`Date.now()` scale) — the ONE source
   * of truth for any countdown, so the number on screen and the moment logout
   * fires cannot drift apart.
   */
  onWarn: (info: { logoutAt: number }) => void;
  /** Called (at most once) when the logout threshold is reached */
  onLogout: () => void;
  /**
   * Called when the warning ends WITHOUT a choice made in this tab — i.e. the
   * user turned out to be active in another tab. Never fired for activity in
   * this tab: once warned, only {@link IdleTimeoutHandle.extend} continues.
   */
  onActive?: () => void;
  /**
   * `localStorage` key holding the last-activity timestamp shared by every tab
   * of this origin. Omit to keep the timer tab-local.
   */
  storageKey?: string;
}

/** What {@link startIdleTimeout} hands back: the explicit "continue" and the teardown. */
export interface IdleTimeoutHandle {
  /** Explicit "I'm still here": leave the warning phase and restart the clock. */
  extend: () => void;
  /** Tear down timers and listeners. Idempotent. */
  stop: () => void;
}

const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = [
  'mousedown',
  'click',
  'keydown',
  'touchstart',
];

/** Throttle activity resets to avoid excessive timer restarts */
const THROTTLE_MS = 10_000;

/** Longest a single `setTimeout` may be asked to wait (2^31-1 ms overflows to 0). */
const MAX_TIMER_MS = 2_147_483_647;

function readSharedActivity(storageKey: string | undefined): number | null {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeSharedActivity(storageKey: string | undefined, at: number): void {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, String(at));
  } catch {
    /* storage unavailable (private mode) — the timer simply stays tab-local */
  }
}

/**
 * Start the idle timer — see the module docs above for its three guarantees.
 * Counts from now (mounting is itself proof of presence); returns the handle
 * that continues or tears down the watch.
 */
export function startIdleTimeout(options: IdleTimeoutOptions): IdleTimeoutHandle {
  const { warnAfterMs, logoutAfterMs, onWarn, onLogout, onActive, storageKey } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let isWarning = false;
  let finished = false;
  let lastActivity = Date.now();

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** Fold in activity from sibling tabs. A clock that ran backwards is ignored. */
  function syncSharedActivity() {
    const shared = readSharedActivity(storageKey);
    if (shared !== null && shared > lastActivity && shared <= Date.now()) {
      lastActivity = shared;
    }
  }

  /**
   * The one decision point. Every wake-up — a timer, a tab becoming visible, a
   * sibling tab's activity — lands here and re-derives the phase from the wall
   * clock, so a late or throttled timer can only be late, never wrong.
   */
  function evaluate() {
    if (finished) return;
    clearTimer();
    syncSharedActivity();

    const idleFor = Date.now() - lastActivity;

    if (idleFor >= logoutAfterMs) {
      finished = true;
      isWarning = false;
      onLogout();
      return;
    }

    if (idleFor >= warnAfterMs) {
      if (!isWarning) {
        isWarning = true;
        onWarn({ logoutAt: lastActivity + logoutAfterMs });
      }
      timer = setTimeout(evaluate, Math.min(logoutAfterMs - idleFor, MAX_TIMER_MS));
      return;
    }

    if (isWarning) {
      // Only a sibling tab can move `lastActivity` while this one is warning.
      isWarning = false;
      onActive?.();
    }
    timer = setTimeout(evaluate, Math.min(warnAfterMs - idleFor, MAX_TIMER_MS));
  }

  function recordActivity() {
    lastActivity = Date.now();
    writeSharedActivity(storageKey, lastActivity);
  }

  function handleActivity() {
    if (finished) return;
    // Warned: only an explicit choice may continue the session (see point 1 in
    // the module docs). This is what lets the dialog's buttons be pressed.
    if (isWarning) return;
    // Throttle: don't reset timers for every micro-event
    if (Date.now() - lastActivity < THROTTLE_MS) return;

    recordActivity();
    evaluate();
  }

  function handleStorage(event: StorageEvent) {
    if (event.key === storageKey) evaluate();
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible') evaluate();
  }

  // Bind activity listeners
  const controller = new AbortController();
  for (const event of ACTIVITY_EVENTS) {
    document.addEventListener(event, handleActivity, {
      passive: true,
      signal: controller.signal,
    });
  }
  // Waking from sleep / returning to a throttled tab: re-check immediately
  // rather than whenever the delayed timer gets round to firing.
  document.addEventListener('visibilitychange', handleVisibility, {
    signal: controller.signal,
  });
  window.addEventListener('focus', evaluate, { signal: controller.signal });
  if (storageKey) {
    window.addEventListener('storage', handleStorage, { signal: controller.signal });
  }

  // Mounting is itself proof of presence (a page load or a fresh sign-in).
  recordActivity();
  evaluate();

  return {
    extend: () => {
      if (finished) return;
      isWarning = false;
      recordActivity();
      evaluate();
    },
    stop: () => {
      finished = true;
      clearTimer();
      controller.abort();
    },
  };
}
