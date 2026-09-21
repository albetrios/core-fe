/**
 * Stale-chunk recovery — turns a lazy chunk that a newer deploy has already
 * renamed away into one clean reload onto the current build.
 *
 * @remarks
 * Every deploy renames the content-hashed assets. A tab that was open across a
 * deploy still holds the OLD chunk graph, so the next `import()` it makes — a
 * route island, the toast runtime, the settings modal — requests a file the CDN
 * no longer has. Vite dispatches `vite:preloadError` on `window` for exactly
 * that failure, and this module handles the fallout.
 *
 * The recovery is narrow on purpose, because `vite:preloadError` is NOT a
 * stale-chunk signal on its own:
 *
 * - **A newer build must actually be advertised** ({@link isNewBuildAdvertised}).
 *   Being offline, a flaky CDN and a genuinely missing chunk all raise the same
 *   event, and cosmetic prefetches (`initDeferredIconSets`, `preloadBootRoutes`)
 *   raise it for chunks that are deliberately outside the service-worker
 *   precache. Reloading on those would abort work — an in-flight `/auth/refresh`
 *   on a cold load, most sharply — to fix nothing. Asking `version.json` first
 *   makes the reload conditional on the one cause a reload can repair.
 * - **At most one reload per buildId** ({@link STALE_CHUNK_RELOADED_FOR_KEY}).
 *   If the reload lands on the same broken build the marker still matches, so a
 *   permanently missing chunk degrades instead of looping.
 * - **Never while the user is typing.** The import already failed; losing a
 *   half-filled form on top of it is a second failure. Re-checked after the
 *   probe, since focus can move while it is in flight.
 *
 * The event is deliberately **not** `preventDefault()`ed. Vite's helper is
 * `import().catch(dispatch)`, so suppressing the rethrow makes the import
 * RESOLVE WITH `undefined` — and the caller then reads an export off `undefined`
 * and reports a misleading `TypeError` instead of "Failed to fetch dynamically
 * imported module". Letting the real error through keeps the error boundary and
 * Sentry honest for the seconds before the reload lands, and for every case
 * where we stand down.
 *
 * Reload goes through {@link reloadOntoLatestBuild}, not `location.reload()`:
 * a raw reload can be served by the still-old service worker and revive the
 * exact chunks that just failed.
 */

import { isEditableElementFocused } from '@/lib/editable-focus.ts';
import { readInjectedAppBuildId } from '@/lib/i18n/build-env.ts';

import { isNewBuildAdvertised, reloadOntoLatestBuild } from './check.ts';
import { alreadyReloadedFor, markReloadedFor } from './reload-marker.ts';
import { STALE_CHUNK_RELOADED_FOR_KEY } from './version-check.constants.ts';

/** Vite's preload-failure event name (dispatched on `window`). */
const PRELOAD_ERROR_EVENT = 'vite:preloadError';

let installed = false;

/**
 * Listen for failed lazy-chunk loads and, when a newer deploy is what broke
 * them, reload onto it. Call once from `main.tsx`; returns a teardown, or
 * `undefined` when the listener was not installed.
 *
 * @remarks
 * Not env-gated, and deliberately so: this is resilience, not diagnostics, and
 * the repo's one-behaviour-one-flag rule would make it invent a flag of its own.
 * The buildId is the real precondition — without an injected `VITE_APP_BUILD_ID`
 * there is no build identity to cap reloads against, so the listener is not
 * installed at all. Repeat calls are no-ops, and only one probe runs at a time
 * however many chunks fail at once.
 */
export function startStaleChunkRecovery(): (() => void) | undefined {
  if (installed) return undefined;

  const buildId = readInjectedAppBuildId();
  if (!buildId) return undefined;

  let probing = false;

  const standDown = (): boolean =>
    isEditableElementFocused() ||
    alreadyReloadedFor(STALE_CHUNK_RELOADED_FOR_KEY, buildId);

  const onPreloadError = (): void => {
    if (probing || standDown()) return;
    probing = true;

    void isNewBuildAdvertised()
      .then((isNewBuild) => {
        // Re-checked after the await: focus can move, and the version-check
        // poller may have spent this build's reload while the probe was open.
        if (!isNewBuild || standDown()) return;
        markReloadedFor(STALE_CHUNK_RELOADED_FOR_KEY, buildId);
        reloadOntoLatestBuild();
      })
      .finally(() => {
        probing = false;
      });
  };

  window.addEventListener(PRELOAD_ERROR_EVENT, onPreloadError);
  installed = true;

  return () => {
    window.removeEventListener(PRELOAD_ERROR_EVENT, onPreloadError);
    installed = false;
  };
}
