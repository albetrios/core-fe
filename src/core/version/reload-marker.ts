/**
 * Per-tab "I already reloaded for this build" markers — the shared reload-loop
 * guard behind every automatic page reload in `core/version/`.
 *
 * @remarks
 * Both reload paths (the deferred version-check reload and stale-chunk
 * recovery) can fire repeatedly against the SAME build: version.json keeps
 * advertising the newer id, and a broken chunk keeps 404ing. Remembering the
 * buildId a tab has already reloaded for caps each path at one reload per
 * advertised build, so a half-propagated deploy or a permanently missing chunk
 * degrades instead of looping. Each path passes its own storage key so one
 * standing down never consumes the other's single attempt.
 *
 * `sessionStorage` throws in some privacy modes; every access fails OPEN — at
 * worst one extra reload, never a lost recovery.
 */

/**
 * True when this tab has already reloaded for `buildId` under `key`.
 *
 * @remarks
 * Failing open (returning false) on a storage error is deliberate: an
 * unreadable marker must not block the first recovery attempt.
 */
export function alreadyReloadedFor(key: string, buildId: string): boolean {
  try {
    return sessionStorage.getItem(key) === buildId;
  } catch {
    return false;
  }
}

/**
 * Record that this tab is reloading for `buildId` under `key`.
 *
 * @remarks
 * Best effort. Without the marker a tab may reload twice for one build, which
 * is strictly better than suppressing a reload that would have fixed the page.
 */
export function markReloadedFor(key: string, buildId: string): void {
  try {
    sessionStorage.setItem(key, buildId);
  } catch {
    // Private mode — see the module remarks: fail open.
  }
}
