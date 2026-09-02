/**
 * Proactive token refresh timer.
 *
 * Instead of waiting for a 401, this module schedules a silent refresh
 * ~60 seconds before the access token expires. This eliminates the
 * brief failure-and-retry cycle that happens with reactive 401 handling.
 *
 * Flow:
 *   1. After login or refresh, call `scheduleTokenRefresh()`.
 *   2. Timer fires `BUFFER_MS` before `exp` claim.
 *   3. If user is on a different tab (document hidden), defer until tab becomes visible.
 *   4. On success, reschedule for the new token's expiry.
 *   5. On failure, fall back to the 401 interceptor (which will force logout).
 */

import { platformConfig } from '@/core/config/env.ts';
import { silentRefresh } from '@/shared/auth/service.ts';
import { getTokenExpiry } from '@/shared/auth/token.ts';

/** Refresh this many ms before token expiry */
const BUFFER_MS = 60_000;

/** Minimum delay to prevent runaway loops */
const MIN_DELAY_MS = 5_000;

let refreshTimerId: ReturnType<typeof setTimeout> | null = null;

/**
 * Aborts the deferred `visibilitychange` listener the timer installs when it
 * fires against a hidden tab. Cancelling the timer id alone left that listener
 * on `document` forever: after logout, the next time the user focused the tab it
 * ran a refresh for a session that no longer exists — and core-be rotates
 * refresh sessions with **reuse detection**, so that request is not a harmless
 * 401, it is a session-killer. Worse, one listener was added per login/logout
 * cycle and none were ever removed (X-7).
 */
let deferredRefreshAbort: AbortController | null = null;

/**
 * Schedule the next proactive refresh based on the current token's `exp` claim.
 * Safe to call multiple times — cancels any existing timer first.
 */
export function scheduleTokenRefresh(): void {
  cancelTokenRefresh();

  const exp = getTokenExpiry();
  if (exp === null) return; // No token or no exp — nothing to schedule

  const expiresAt = exp * 1000; // convert to ms
  const delay = Math.max(expiresAt - Date.now() - BUFFER_MS, MIN_DELAY_MS);

  refreshTimerId = setTimeout(() => {
    refreshTimerId = null;
    // If tab is hidden, defer until it becomes visible.
    if (document.hidden) {
      const abort = new AbortController();
      deferredRefreshAbort = abort;
      document.addEventListener(
        'visibilitychange',
        () => {
          // visibilitychange also fires on hide; only a return to visible counts.
          if (document.hidden) return;
          abort.abort();
          deferredRefreshAbort = null;
          void doProactiveRefresh();
        },
        { signal: abort.signal },
      );
      return;
    }

    void doProactiveRefresh();
  }, delay);

  if (platformConfig.debugLogging) {
    console.info(
      `[RefreshTimer] Scheduled refresh in ${Math.round(delay / 1000)}s (token expires in ${Math.round((expiresAt - Date.now()) / 1000)}s)`,
    );
  }
}

async function doProactiveRefresh(): Promise<void> {
  try {
    await silentRefresh();
    // Reschedule for the new token's expiry
    scheduleTokenRefresh();
  } catch {
    // silentRefresh failed — the 401 interceptor will handle the next request
    if (platformConfig.debugLogging) {
      console.warn('[RefreshTimer] Proactive refresh failed — will retry on next 401');
    }
  }
}

/**
 * Cancel any pending refresh — the timer AND the deferred visibility listener it
 * may have installed. Called on logout; both halves matter, because the listener
 * is the one that outlives the session.
 */
export function cancelTokenRefresh(): void {
  if (refreshTimerId !== null) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }
  deferredRefreshAbort?.abort();
  deferredRefreshAbort = null;
}

/** Test-only: is a deferred visibility listener currently installed? */
export function hasDeferredVisibilityListener(): boolean {
  return deferredRefreshAbort !== null;
}
