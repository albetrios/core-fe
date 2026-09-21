/**
 * Version check service — detects new deployments and auto-reloads the browser
 * to the latest CDN build, but only at a moment that won't destroy in-flight work.
 *
 * In production only:
 * - Polls /version.json periodically (cache-busting query param) + on tab refocus.
 * - When the advertised buildId differs from the one the app was built with, it
 *   marks a reload **pending** instead of reloading immediately, then applies it
 *   the moment it's *safe*:
 *     • never while the user is editing a field (input/textarea/select/CE),
 *     • immediately when the tab is hidden (the reload is invisible),
 *     • otherwise once the user has gone idle (no input for IDLE_AFTER_MS) or
 *       returns to the tab.
 *
 * Users get fresh code after a release without a jarring mid-task reload.
 */

import { platformConfig } from '@/core/config/env.ts';
import { isEditableElementFocused } from '@/lib/editable-focus.ts';
import { readInjectedAppBuildId } from '@/lib/i18n/build-env.ts';

import {
  alreadyReloadedFor as hasReloadedFor,
  markReloadedFor as recordReloadFor,
} from './reload-marker.ts';
import {
  VERSION_CHECK_INITIAL_DELAY_MS,
  VERSION_CHECK_RELOADED_FOR_KEY,
} from './version-check.constants.ts';
import { isVersionUpdateSnoozed, snoozeVersionUpdate } from './version-update-snooze.ts';

// 5 minutes: the visibilitychange re-check catches returning users instantly,
// hidden tabs pause polling entirely, and the browser's own sw.js update check
// on navigations is a third detection path — a faster poll adds requests, not
// meaningful freshness.
const POLL_INTERVAL_MS = 5 * 60_000;
const IDLE_AFTER_MS = 60_000; // consider the user idle after 60s with no input
const SAFE_RECHECK_MS = 10_000; // while a reload is pending, re-test safety this often
// Deadline for the service-worker reload handoff: if the new worker hasn't
// reached `waiting` by then (slow connection mid-install, SW error), fall back
// to a plain reload — the reload-loop guard below keeps a stale-served shell
// from looping.
const SW_ACTIVATE_DEADLINE_MS = 10_000;

/** Input gestures that count as "the user is active" (reset the idle clock). */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

let initialized = false;

function getVersionUrl(): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') || '';
  return `${base}/version.json`;
}

type VersionPayload = { buildId: string; builtAt: string };

interface VersionCheckUpdateContext {
  buildId: string;
  /** Reload now (marks loop guard + clears pending state). */
  reloadNow: () => void;
  /** Snooze the update toast for this buildId (dismiss / Later). */
  snooze: () => void;
}

export interface VersionCheckOptions {
  /**
   * Called once per newly detected buildId while the tab is visible enough to
   * notify. Use for a "Refresh now" toast; silent reload on hidden tab / idle
   * still runs when a reload is pending.
   */
  onUpdateAvailable?: (ctx: VersionCheckUpdateContext) => void;
}

function getCurrentBuildId(): string | undefined {
  return readInjectedAppBuildId();
}

async function fetchVersion(): Promise<VersionPayload | null> {
  try {
    // `cache: 'no-store'` already bypasses every HTTP cache end-to-end (and the
    // server pins Cache-Control: no-store) — a ?t= query buster would only
    // fragment logs and defeat validators for no extra freshness.
    const res = await fetch(getVersionUrl(), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as VersionPayload;
    return typeof data?.buildId === 'string' ? data : null;
  } catch {
    return null;
  }
}

function shouldReload(
  latest: VersionPayload | null,
  current: string | undefined,
): boolean {
  if (!(latest && current)) return false;
  return latest.buildId !== current;
}

/**
 * Reload-loop guard: remember (per tab) which buildId we already reloaded
 * for. If the mismatch survives a reload — the SW handoff hit its deadline
 * and the plain-reload fallback was served by a still-old worker, a CDN edge
 * serving index.html stale, or a half-propagated deploy — reloading again
 * would loop forever, so we stand down until version.json advertises a NEWER
 * buildId. The marker itself lives in `reload-marker.ts`, shared with
 * stale-chunk recovery (each path owns its own key).
 */
const alreadyReloadedFor = (buildId: string) =>
  hasReloadedFor(VERSION_CHECK_RELOADED_FOR_KEY, buildId);

const markReloadedFor = (buildId: string) =>
  recordReloadFor(VERSION_CHECK_RELOADED_FOR_KEY, buildId);

/**
 * Whether the server is advertising a build DIFFERENT from the one this bundle
 * was built as. Resolves `false` when the answer is unknown.
 *
 * @remarks
 * The same comparison the poller makes, exposed for stale-chunk recovery: a
 * failed lazy chunk only warrants a reload if a newer deploy actually replaced
 * it. Offline, a flaky CDN and a genuinely missing chunk all surface as the same
 * `vite:preloadError`, and only this call separates them. Every failure mode —
 * no injected build id, an unreachable or malformed `version.json` — resolves
 * `false`, so an unanswerable question never triggers a reload.
 */
export async function isNewBuildAdvertised(): Promise<boolean> {
  const current = getCurrentBuildId();
  if (!current) return false;
  return shouldReload(await fetchVersion(), current);
}

/**
 * Fire-and-forget: ask the browser to fetch + install the latest sw.js NOW, so
 * the new build's worker is already `waiting` by the time the deferred reload
 * fires and the SKIP_WAITING handoff is instant (called at detection time).
 */
function requestServiceWorkerUpdate(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .getRegistration()
    .then((registration) => registration?.update())
    .catch(() => {
      // Best effort — offline or a transient fetch failure; the reload path
      // retries update() itself.
    });
}

/** Resolve the `waiting` worker, following an in-flight install to `installed`. */
function waitForWaitingWorker(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorker | null> {
  if (registration.waiting) return Promise.resolve(registration.waiting);
  const installing = registration.installing;
  if (!installing) return Promise.resolve(null);
  return new Promise((resolve) => {
    const onStateChange = () => {
      if (installing.state === 'installed') {
        installing.removeEventListener('statechange', onStateChange);
        resolve(registration.waiting ?? installing);
      } else if (installing.state === 'redundant') {
        installing.removeEventListener('statechange', onStateChange);
        resolve(null);
      }
    };
    installing.addEventListener('statechange', onStateChange);
  });
}

/**
 * Reload the page so it lands on the NEWEST deployed build. When a service
 * worker controls the page, a bare `location.reload()` re-serves the OLD
 * precached shell — this helper first installs/activates any newer worker
 * (SKIP_WAITING handshake, bounded by {@link SW_ACTIVATE_DEADLINE_MS}), then
 * reloads; without SW support it reloads directly. Use this instead of
 * `window.location.reload()` for every "reload the app" affordance (error
 * boundaries, the update toast) — a raw reload can revive the exact stale
 * chunks that caused the failure.
 */
export function reloadOntoLatestBuild(): void {
  if ('serviceWorker' in navigator) {
    void reloadThroughServiceWorker();
  } else {
    window.location.reload();
  }
}

/**
 * The SW leg of {@link reloadOntoLatestBuild}: update() → wait for the new
 * worker to reach `waiting` → SKIP_WAITING → reload on `controllerchange`.
 * Every failure branch falls back to a plain reload, and
 * {@link SW_ACTIVATE_DEADLINE_MS} guarantees we never hang.
 */
async function reloadThroughServiceWorker(): Promise<void> {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.location.reload();
  };
  const deadline = window.setTimeout(finish, SW_ACTIVATE_DEADLINE_MS);
  try {
    const container = navigator.serviceWorker;
    const registration = await container.getRegistration();
    if (!registration) {
      clearTimeout(deadline);
      finish();
      return;
    }
    try {
      await registration.update();
    } catch {
      // Offline / transient — proceed with whatever worker is already installed.
    }
    const waiting = await waitForWaitingWorker(registration);
    if (!waiting) {
      // No newer worker (SW already current, or none) — a plain reload is safe.
      clearTimeout(deadline);
      finish();
      return;
    }
    container.addEventListener(
      'controllerchange',
      () => {
        clearTimeout(deadline);
        finish();
      },
      { once: true },
    );
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } catch {
    clearTimeout(deadline);
    finish();
  }
}

/**
 * Start the version check. Only runs in production.
 * Call once from main.tsx after app bootstrap.
 *
 * Returns a cleanup function that removes listeners and stops polling, or
 * undefined if version checking was not started.
 */
export function startVersionCheck(
  options?: VersionCheckOptions,
): (() => void) | undefined {
  // Env-gated (VITE_VERSION_CHECK) — on in deployed envs, off locally and in tests.
  if (initialized || !platformConfig.versionCheckEnabled) return;

  const currentBuildId = getCurrentBuildId();
  if (!currentBuildId) return;

  initialized = true;

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let safetyTimer: ReturnType<typeof setInterval> | null = null;
  let pendingBuildId: string | null = null;
  let toastShownForBuildId: string | null = null;
  let lastActivityAt = Date.now();

  const markActivity = () => {
    lastActivityAt = Date.now();
  };

  // Reloading is "safe" when it won't throw away in-flight work.
  function safeToReload(): boolean {
    if (isEditableElementFocused()) return false; // never interrupt active editing
    if (document.visibilityState === 'hidden') return true; // away → invisible reload
    return Date.now() - lastActivityAt >= IDLE_AFTER_MS; // otherwise wait for idle
  }

  function applyReload(buildId: string): void {
    markReloadedFor(buildId);
    pendingBuildId = null;
    toastShownForBuildId = null;
    stopSafetyWatch();
    if (platformConfig.debugLogging) {
      console.info('[VersionCheck] Applying deferred reload for', buildId);
    }
    reloadOntoLatestBuild();
  }

  function tryPendingReload(): void {
    if (pendingBuildId && safeToReload()) applyReload(pendingBuildId);
  }

  function startSafetyWatch(): void {
    if (safetyTimer) return;
    safetyTimer = setInterval(tryPendingReload, SAFE_RECHECK_MS);
  }

  function stopSafetyWatch(): void {
    if (safetyTimer) {
      clearInterval(safetyTimer);
      safetyTimer = null;
    }
  }

  async function checkForUpdate(): Promise<void> {
    const latest = await fetchVersion();
    if (!(latest && shouldReload(latest, currentBuildId))) return;

    if (alreadyReloadedFor(latest.buildId)) {
      // Reloaded for this deployment already and STILL on the old build —
      // something upstream serves index.html stale. Don't loop.
      console.warn(
        '[VersionCheck] Still on the old build after reloading for',
        latest.buildId,
        '— suppressing further reloads for this deployment.',
      );
      return;
    }

    // New deployment detected — defer the reload until it's safe (idle / hidden).
    pendingBuildId = latest.buildId;

    // Pre-warm: fetch + install the new build's SW in the background now, so
    // the eventual reload handoff (SKIP_WAITING → controllerchange) is instant.
    requestServiceWorkerUpdate();

    if (isVersionUpdateSnoozed(latest.buildId)) {
      toastShownForBuildId = null;
    } else if (toastShownForBuildId !== latest.buildId) {
      toastShownForBuildId = latest.buildId;
      options?.onUpdateAvailable?.({
        buildId: latest.buildId,
        reloadNow: () => applyReload(latest.buildId),
        snooze: () => {
          snoozeVersionUpdate(latest.buildId);
          toastShownForBuildId = null;
        },
      });
    }

    if (platformConfig.debugLogging) {
      console.info('[VersionCheck] New deployment detected; will reload when idle…');
    }
    startSafetyWatch();
    tryPendingReload();
  }

  function schedulePoll(): void {
    if (pollTimer) return;
    pollTimer = setInterval(checkForUpdate, POLL_INTERVAL_MS);
  }

  function stopPoll(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Initial check after a short delay (avoid blocking bootstrap).
  const initialCheck = setTimeout(checkForUpdate, VERSION_CHECK_INITIAL_DELAY_MS);

  // Poll while the tab is visible.
  schedulePoll();

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      // Returned to the tab — re-check and apply any pending reload (a refocus
      // is a natural break point).
      void checkForUpdate();
      schedulePoll();
      tryPendingReload();
    } else {
      stopPoll();
      // Tab hidden — a pending reload is now invisible, so take it.
      tryPendingReload();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  for (const evt of ACTIVITY_EVENTS) {
    window.addEventListener(evt, markActivity, { passive: true });
  }

  return () => {
    clearTimeout(initialCheck);
    stopPoll();
    stopSafetyWatch();
    document.removeEventListener('visibilitychange', onVisibility);
    for (const evt of ACTIVITY_EVENTS) {
      window.removeEventListener(evt, markActivity);
    }
    initialized = false;
  };
}
