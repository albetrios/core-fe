/**
 * Stale-chunk recovery — turns a lazy chunk that no longer exists into one
 * clean reload onto the current build.
 *
 * @remarks
 * Every deploy renames the content-hashed assets. A tab that was open across a
 * deploy still holds the OLD chunk graph, so the next `import()` it makes —
 * a route island, the toast runtime, the settings modal — requests a file the
 * CDN no longer has. On Netlify the SPA catch-all then rewrites that miss to
 * `index.html` with a 200 and the browser reports the famously unhelpful
 * "Expected a JavaScript-or-Wasm module script but the server responded with a
 * MIME type of text/html". `netlify.toml` now answers a missing `/assets/*`
 * with a real 404, and this module handles the fallout.
 *
 * Vite dispatches `vite:preloadError` on `window` for exactly this failure.
 * The recovery is narrow on purpose:
 *
 * - **At most one reload per buildId** ({@link STALE_CHUNK_RELOADED_FOR_KEY}).
 *   If the reload lands on the same broken build the marker still matches and
 *   we stand down, so a permanently missing chunk degrades instead of looping.
 * - **Never while the user is typing** — the import already failed; losing a
 *   half-filled form on top of it is a second failure. The version-check poller
 *   reaches the same conclusion within its interval and reloads when it is safe.
 * - **`preventDefault()` only when we act.** Standing down leaves Vite to throw,
 *   so the failure still reaches the error boundary and Sentry rather than
 *   vanishing.
 *
 * Reload goes through {@link reloadOntoLatestBuild}, not `location.reload()`:
 * a raw reload can be served by the still-old service worker and revive the
 * exact chunks that just 404'd.
 */

import { isEditableElementFocused } from '@/lib/editable-focus.ts';
import { readInjectedAppBuildId } from '@/lib/i18n/build-env.ts';

import { reloadOntoLatestBuild } from './check.ts';
import { alreadyReloadedFor, markReloadedFor } from './reload-marker.ts';
import { STALE_CHUNK_RELOADED_FOR_KEY } from './version-check.constants.ts';

/** Vite's preload-failure event name (dispatched on `window`). */
const PRELOAD_ERROR_EVENT = 'vite:preloadError';

let installed = false;

/**
 * Listen for failed lazy-chunk loads and recover by reloading onto the current
 * build. Call once from `main.tsx`; returns a teardown, or `undefined` when the
 * listener was not installed.
 *
 * @remarks
 * Not env-gated, and deliberately so: this is resilience, not diagnostics, and
 * the repo's one-behaviour-one-flag rule means it would need a flag of its own
 * to gate. The buildId guard is the real precondition — without an injected
 * `VITE_APP_BUILD_ID` there is no build identity to cap reloads against, so the
 * listener is not installed at all. Repeat calls are no-ops.
 */
export function startStaleChunkRecovery(): (() => void) | undefined {
  if (installed) return undefined;

  const buildId = readInjectedAppBuildId();
  if (!buildId) return undefined;

  const onPreloadError = (event: Event): void => {
    // The page is already degraded; do not add a reload on top of lost input.
    // The version-check poller picks the same mismatch up and reloads safely.
    if (isEditableElementFocused()) return;
    if (alreadyReloadedFor(STALE_CHUNK_RELOADED_FOR_KEY, buildId)) return;

    // We are handling it — suppress Vite's rethrow for the reload we are about
    // to perform. Both stand-down branches above leave the throw intact.
    event.preventDefault();
    markReloadedFor(STALE_CHUNK_RELOADED_FOR_KEY, buildId);
    reloadOntoLatestBuild();
  };

  window.addEventListener(PRELOAD_ERROR_EVENT, onPreloadError);
  installed = true;

  return () => {
    window.removeEventListener(PRELOAD_ERROR_EVENT, onPreloadError);
    installed = false;
  };
}
