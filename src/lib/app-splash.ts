/** HTML boot splash lives outside `#root` until React fades it out. */

const SPLASH_ID = 'app-splash';
const EXIT_CLASS = 'app-splash-exiting';
const DISMISS_EVENT = 'app-splash-dismissed';

/** Matches the `#app-splash` opacity/visibility transition in index.html (200ms) plus slack. */
const EXIT_FALLBACK_MS = 360;

/**
 * Grace period between the last hold releasing and the fade actually starting.
 *
 * A route handoff drops to zero holds for a moment — the outgoing screen's loader
 * unmounts a few frames before the incoming one mounts. Exiting on that gap makes
 * the splash dim and then snap back to full opacity when the next hold arrives,
 * which is the blink all over again. Measured gap on the OAuth callback → next
 * screen handoff is ~70ms, so this is comfortably wider while staying far below
 * the threshold where a human reads it as lag.
 */
const EXIT_GRACE_MS = 250;

/**
 * How long to wait once the router says the destination is on screen.
 *
 * {@link EXIT_GRACE_MS} is a guess about the FUTURE — "another loader may be
 * about to mount" — and it is only right while a navigation is still in flight.
 * Once the router has resolved there is no next loader coming, and those 250ms
 * were pure dead time: the login form (or the dashboard) sat fully rendered
 * behind an opaque overlay, on every single cold load. Two frames is enough for a
 * hold taken in the same commit (a layout effect) to land first.
 */
const SETTLED_EXIT_DELAY_MS = 32;

/**
 * Ceiling on how long holds may keep the splash up once dismissal was requested.
 * A bootstrap that never resolves must not trap the user behind an inert HTML
 * overlay — past this the splash leaves and React's own loader takes the screen,
 * because that one can surface an error and a Retry.
 */
const MAX_HOLD_MS = 8000;

/** The overlay these module-level counters describe; identity change ⇒ reset. */
let tracked: HTMLElement | null = null;
let holdCount = 0;
let dismissRequested = false;
let holdDeadlineReached = false;
/** The router has resolved: what is mounted is the destination, not a way-point. */
let contentSettled = false;
let exitFinish: (() => void) | undefined;
let exitTimer: number | undefined;
let holdDeadline: number | undefined;
let releaseTimer: number | undefined;

/**
 * The live overlay, resetting hold/dismiss state whenever the node identity
 * changes (it is removed on exit, and remade between tests). Keeps the counters
 * from outliving the element they were counting for.
 */
function currentSplash(): HTMLElement | null {
  const splash = document.getElementById(SPLASH_ID);
  if (splash !== tracked) {
    tracked = splash;
    holdCount = 0;
    dismissRequested = false;
    holdDeadlineReached = false;
    contentSettled = false;
    exitFinish = undefined;
    if (exitTimer !== undefined) window.clearTimeout(exitTimer);
    exitTimer = undefined;
    if (holdDeadline !== undefined) window.clearTimeout(holdDeadline);
    holdDeadline = undefined;
    if (releaseTimer !== undefined) window.clearTimeout(releaseTimer);
    releaseTimer = undefined;
  }
  return splash;
}

/** True while the pre-React `#app-splash` overlay is still in the document. */
export function isAppSplashActive(): boolean {
  return currentSplash() != null;
}

/** Subscribe once when the boot splash finishes its exit transition (or is removed). */
export function onAppSplashDismissed(callback: () => void): () => void {
  if (!isAppSplashActive()) {
    callback();
    return () => undefined;
  }
  window.addEventListener(DISMISS_EVENT, callback, { once: true });
  return () => window.removeEventListener(DISMISS_EVENT, callback);
}

/** Start the fade-out and remove the node when it lands. */
function runExit(): void {
  const splash = currentSplash();
  if (!splash || exitFinish) return;

  splash.classList.add(EXIT_CLASS);

  const finish = () => {
    if (holdDeadline !== undefined) window.clearTimeout(holdDeadline);
    holdDeadline = undefined;
    if (exitTimer !== undefined) window.clearTimeout(exitTimer);
    exitTimer = undefined;
    exitFinish = undefined;
    splash.removeEventListener('transitionend', finish);
    splash.remove();
    window.dispatchEvent(new CustomEvent(DISMISS_EVENT));
  };

  exitFinish = finish;
  splash.addEventListener('transitionend', finish, { once: true });
  exitTimer = window.setTimeout(finish, EXIT_FALLBACK_MS);
}

/** Put a mid-flight fade back to full opacity — the app was not ready after all. */
function cancelExit(): void {
  const splash = currentSplash();
  if (!(splash && exitFinish)) return;

  splash.removeEventListener('transitionend', exitFinish);
  if (exitTimer !== undefined) window.clearTimeout(exitTimer);
  exitTimer = undefined;
  exitFinish = undefined;
  splash.classList.remove(EXIT_CLASS);
}

/**
 * Re-check after {@link EXIT_GRACE_MS} instead of exiting the moment a hold drops
 * to zero. StrictMode remounts an effect as setup → cleanup → setup, and a route
 * swap unmounts one loader before the next mounts; both are a momentary zero that
 * must not start a fade the next hold then has to cancel.
 */
function scheduleExitCheck(): void {
  if (releaseTimer !== undefined) return;
  releaseTimer = window.setTimeout(
    () => {
      releaseTimer = undefined;
      if (holdCount === 0 && dismissRequested) runExit();
    },
    contentSettled ? SETTLED_EXIT_DELAY_MS : EXIT_GRACE_MS,
  );
}

/**
 * The router finished resolving a navigation — the destination is mounted.
 *
 * From here a zero-hold moment is the real thing rather than a gap between two
 * loaders, so the splash may leave on the next frames instead of sitting out the
 * grace window. Any check already waiting on that window is brought forward.
 * Wired to the router's `onResolved` in `main.tsx` (this module cannot import it:
 * `lib` sits below `app`).
 */
export function markAppContentSettled(): void {
  if (!isAppSplashActive() || contentSettled) return;
  contentSettled = true;
  if (releaseTimer === undefined) return;
  window.clearTimeout(releaseTimer);
  releaseTimer = undefined;
  scheduleExitCheck();
}

/**
 * A navigation started — whatever is mounted is on its way out again, and the
 * next thing to mount may well be a loader. Back to the conservative grace
 * window (this is the OAuth callback → next screen handoff it was measured on).
 */
export function markAppContentPending(): void {
  if (!isAppSplashActive()) return;
  contentSettled = false;
}

/**
 * Keep the boot splash on screen while a full-page loader would otherwise
 * replace it, and release when that loader goes away.
 *
 * The splash and {@link FullPageSpinner} are the same visual, so handing off
 * between them mid-bootstrap reads as the loading screen blinking twice: the
 * HTML overlay fades to nothing at React's first paint, then an identical React
 * one pops back in at full opacity a frame later. Holding collapses that into a
 * single continuous screen that fades out once only, when real content is ready.
 *
 * Returns a release function; calling it more than once is a no-op. No-ops
 * entirely once the splash is gone — a loader shown later in the session is a
 * normal Suspense fallback and must never resurrect the boot overlay.
 */
export function holdAppSplash(): () => void {
  if (!isAppSplashActive() || holdDeadlineReached) return () => undefined;

  holdCount += 1;
  if (releaseTimer !== undefined) {
    window.clearTimeout(releaseTimer);
    releaseTimer = undefined;
  }
  cancelExit();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    holdCount = Math.max(0, holdCount - 1);
    if (holdCount === 0 && dismissRequested) scheduleExitCheck();
  };
}

/**
 * Fade out the HTML boot loader after React has painted underneath.
 * Idempotent — safe to call multiple times.
 *
 * With holds outstanding this only *records* the request: React has painted, but
 * what it painted is another loader, so the splash stays until the last
 * {@link holdAppSplash} releases (or {@link MAX_HOLD_MS} elapses).
 */
export function dismissAppSplash(): void {
  if (!isAppSplashActive()) return;

  dismissRequested = true;

  // Late route loaders may cancel a fade, but never extend the boot deadline.
  holdDeadline ??= window.setTimeout(() => {
    holdDeadline = undefined;
    holdDeadlineReached = true;
    holdCount = 0;
    runExit();
  }, MAX_HOLD_MS);

  if (holdCount > 0) return;

  // Never exit straight off first paint. React commits its shell a beat before
  // the route's loader mounts, so a splash that leaves on this tick fades part
  // way and is then yanked back when that loader takes its hold.
  scheduleExitCheck();
}

/** Wait for the next two animation frames (post-layout paint). */
export function afterPaint(callback: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}
