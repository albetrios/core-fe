/**
 * Registry for "start fetching the chunks a sign-in lands on".
 *
 * @remarks
 * The auth screens know WHEN a visitor has committed to signing in; only the
 * route tree knows WHICH chunks that lands on. `src/shared` may not import from
 * `src/app`, so the app registers the warm-up at boot and the auth surfaces call
 * it by name — the same inversion {@link setCaptchaSlot} uses.
 *
 * Calling before registration is a silent no-op: the warm-up is speculation, and
 * an unregistered app (a test rendering one panel in isolation) has nothing to
 * warm.
 */

let warmSignedInShellImpl: (() => void) | undefined;

/** Registers the app's warm-up. Pass `undefined` to detach (tests). */
export function registerSignedInShellWarmup(warmUp: (() => void) | undefined): void {
  warmSignedInShellImpl = warmUp;
}

/**
 * Begin fetching the signed-in shell, if the app registered one.
 *
 * @remarks
 * Call at the moment a visitor commits to signing in — submitting an email, or
 * starting an OAuth redirect — not on page load. Never awaited and never throws:
 * it must not delay the action that triggered it.
 */
export function warmSignedInShell(): void {
  warmSignedInShellImpl?.();
}
