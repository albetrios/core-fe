/**
 * Module-level holder for the most recently solved Cloudflare Turnstile token.
 *
 * The invisible widget ({@link InvisibleTurnstile}) writes the freshest token here and
 * {@link authCaptchaHeaders} reads it, so callers never have to thread a token through the
 * auth API. Turnstile tokens are single-use, so {@link consumeTurnstileToken} clears the
 * stored value and asks the widget to mint a replacement in the background.
 */

let currentToken: string | undefined;
let requestReset: (() => void) | undefined;

type TurnstileTokenListener = () => void;
const tokenListeners = new Set<TurnstileTokenListener>();

function notifyTurnstileTokenListeners(): void {
  for (const listener of tokenListeners) {
    listener();
  }
}

/** Subscribe to background Turnstile token changes (for auth submit gating). */
export function subscribeTurnstileToken(listener: TurnstileTokenListener): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

/** Stores the latest Turnstile token, or clears it when called with `undefined`. */
export function setTurnstileToken(token: string | undefined): void {
  currentToken = token;
  notifyTurnstileTokenListeners();
}

/** Returns the current token without consuming it (diagnostics and tests). */
export function peekTurnstileToken(): string | undefined {
  return currentToken;
}

/**
 * Registers the callback the store uses to ask the widget for a fresh token.
 * Pass `undefined` on widget unmount to detach.
 */
export function setTurnstileResetHandler(handler: (() => void) | undefined): void {
  requestReset = handler;
}

/**
 * Asks the widget for a fresh token, outside the consume path.
 *
 * The re-mint after {@link consumeTurnstileToken} is fire-and-forget: if the widget
 * never calls back, every captcha-gated action stays blocked with nothing in flight.
 * The auth UI offers a retry for that dead end and needs this to drive it.
 *
 * @returns `false` when no widget is mounted, so the caller can say so rather than
 * pretending it retried.
 */
export function requestTurnstileReset(): boolean {
  if (!requestReset) return false;
  requestReset();
  return true;
}

/**
 * Returns the current token and immediately invalidates it: the stored value is cleared
 * (Turnstile tokens are single-use) and the widget is asked to solve again so the next
 * auth request carries a fresh token. Returns `undefined` when no token is available.
 */
export function consumeTurnstileToken(): string | undefined {
  const token = currentToken;
  // eslint-disable-next-line security/detect-possible-timing-attacks -- presence check, not a secret comparison
  if (token !== undefined) {
    currentToken = undefined;
    notifyTurnstileTokenListeners();
    requestReset?.();
  }
  return token;
}

/**
 * Resolve once a token exists, or `false` when `timeoutMs` elapses first.
 *
 * @remarks
 * The gated buttons no longer sit disabled waiting for a token — they take the
 * click and resolve the wait themselves, which is what this is for. Two waits
 * use it, with very different budgets: a short one that lets a background solve
 * finish before anything is shown, and a long one that spans a human completing
 * an interactive challenge.
 *
 * Returns `true` immediately when a token is already stored, so the common path
 * costs nothing. The listener is always detached, on every exit.
 */
export function waitForTurnstileToken(timeoutMs: number): Promise<boolean> {
  if (currentToken) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const unsubscribe = subscribeTurnstileToken(() => {
      if (currentToken) finish(true);
    });
  });
}
