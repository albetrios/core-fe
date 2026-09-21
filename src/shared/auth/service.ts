import {
  API_BASE_PATH,
  API_ENDPOINTS,
  AUTH_ROUTES,
  HTTP,
} from '@/core/config/constants.ts';
import { platformConfig } from '@/core/config/env.ts';
import { queryClient } from '@/core/http/queryClient.ts';
import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';
import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { broadcastLogout } from '@/shared/auth/auth-channel.ts';
import { skipAutoGoogleSignIn } from '@/shared/auth/auto-google-sign-in.ts';
import { cancelTokenRefresh, scheduleTokenRefresh } from '@/shared/auth/refresh-timer.ts';
import { clearSessionStart, markSessionStart } from '@/shared/auth/session-lifetime.ts';
import { clearAccessToken, getAccessToken, setAccessToken } from '@/shared/auth/token.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import type { MeContext } from '@/shared/tenancy/me-context.ts';
import {
  hydrateSessionContext,
  invalidateSessionContext,
} from '@/shared/tenancy/session-context.ts';

import type { AuthUser } from './types.ts';

async function authFetch(
  url: string,
  init: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = HTTP.TIMEOUT, ...rest } = init;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...rest,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(rest.headers as Record<string, string>),
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

let authGeneration = 0;
let refreshPromise: Promise<void> | null = null;
let tokenRefreshPromise: Promise<void> | null = null;

/** Logout and new login supersede all work from the previous session. */
function beginAuthGeneration(): number {
  authGeneration += 1;
  invalidateSessionContext();
  refreshPromise = null;
  tokenRefreshPromise = null;
  return authGeneration;
}

function clearLocalAuthState(): void {
  beginAuthGeneration();
  try {
    cancelTokenRefresh();
    clearAccessToken();
    clearSessionStart();
    useAuthStore.getState().clearAuth();
    // Wipe the active-org context too — it holds the RBAC `permissions` that
    // `useCan` reads. Clearing it here (not just relying on the post-logout
    // full-page reload) keeps a non-reloading logout path — e.g. cross-tab
    // logout while already on /login — from leaving one user's grants in the
    // store for the next sign-in.
    useOrganizationStore.getState().clearOrganization();
    // Onboarding progress persists to localStorage (resumable wizard) and
    // holds PII (names, invite emails). Left behind, the NEXT user on this
    // browser would inherit the previous user's step + data — and the wizard
    // would submit the previous user's name onto their account.
    useOnboardingStore.getState().reset();
    queryClient.clear();
  } catch (cleanupError) {
    if (platformConfig.debugLogging) {
      console.error('[Auth] Cleanup failed during logout', cleanupError);
    }
  }
}

/**
 * Why a session ended (the `session_ended` analytics `reason`).
 *
 * @remarks
 * `force_logout` is the one the user did not choose and the app did not time:
 * the server rejected the session (revoked, logout-all, expired refresh). Every
 * other value is a DELIBERATE end — `logout` (the user asked), `idle_timeout`
 * and `session_expired` (the app's own clocks), `cross_tab` (a sibling tab did
 * one of those) — and a deliberate end must not be undone by the login screen,
 * so those also suppress auto-Google sign-in (see {@link forceLogout}).
 */
export type SessionEndReason =
  'force_logout' | 'logout' | 'cross_tab' | 'idle_timeout' | 'session_expired';

/**
 * Clear every local trace of the session and hand the tab to `/login`.
 *
 * @remarks
 * **Local only — this does NOT revoke the server session.** The refresh cookie
 * is HttpOnly and stays valid, so calling this on its own for a session that is
 * still alive signs nobody out: `/login` boots, the silent refresh succeeds, and
 * the guest-only guard bounces the user straight back into the app. It is the
 * right call only when the server session is already gone (a dead session in
 * the fetch client, a deleted account) or has just been revoked ({@link logout}).
 * Anything that means to END a live session — the user menu, the idle-timeout
 * dialog, the absolute session cap — must go through {@link logout}.
 */
export function forceLogout(opts: { reason?: SessionEndReason } = {}): void {
  const reason = opts.reason ?? 'force_logout';
  captureAnalyticsEvent(ANALYTICS_EVENTS.sessionEnded, { reason });
  // A deliberate end must not be undone by the login screen: with auto-Google
  // on, `/login` would start OAuth by itself and a live Google session signs
  // the user back in without a single click. A dead session (`force_logout`)
  // keeps the convenience — nobody asked to leave.
  if (reason !== 'force_logout') skipAutoGoogleSignIn();
  clearLocalAuthState();
  broadcastLogout();
  window.location.href = AUTH_ROUTES.LOGIN;
}

export function handleCrossTabLogout(): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.sessionEnded, { reason: 'cross_tab' });
  // The broadcast does not say WHY the other tab ended the session, so assume
  // the case that must not be undone: a sibling that auto-started Google here
  // would sign the user back in behind the tab they just signed out of.
  skipAutoGoogleSignIn();
  clearLocalAuthState();
  if (window.location.pathname !== AUTH_ROUTES.LOGIN) {
    window.location.href = AUTH_ROUTES.LOGIN;
  }
}

export async function silentRefresh(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  const pending = doSilentRefresh(authGeneration).finally(() => {
    if (refreshPromise === pending) refreshPromise = null;
  });
  refreshPromise = pending;
  return pending;
}

let authBootstrapPromise: Promise<void> | null = null;

export function startAuthBootstrap(): Promise<void> {
  authBootstrapPromise ??= (async () => {
    const generation = authGeneration;
    try {
      // A sign-out the server never heard about comes first: restoring that
      // session is exactly what the user asked not to happen.
      if (isRevokePending()) {
        await finishPendingRevoke(generation);
        throw new Error('Signed out');
      }
      await silentRefresh();
    } catch {
      if (generation !== authGeneration) return;
      const { isAuthenticated } = useAuthStore.getState();
      if (!(isAuthenticated || getAccessToken())) {
        if (platformConfig.debugLogging) {
          console.info('[Bootstrap] No active session');
        }
        useAuthStore.getState().clearAuth();
      }
    } finally {
      if (generation === authGeneration && useAuthStore.getState().isLoading) {
        useAuthStore.getState().setLoading(false);
      }
    }
  })();
  return authBootstrapPromise;
}

export async function awaitAuthBootstrap(): Promise<void> {
  await startAuthBootstrap();
}

const authBase = () => `${platformConfig.apiBaseUrl}${API_BASE_PATH}`;

export async function refreshAccessToken(): Promise<void> {
  if (tokenRefreshPromise) return tokenRefreshPromise;
  const generation = authGeneration;
  const pending = runExclusiveRefresh(generation)
    .catch((error: unknown) => {
      if (generation === authGeneration) throw error;
    })
    .finally(() => {
      if (tokenRefreshPromise === pending) tokenRefreshPromise = null;
    });
  tokenRefreshPromise = pending;
  return pending;
}

async function runExclusiveRefresh(generation: number): Promise<void> {
  const refresh = async () => {
    if (generation !== authGeneration) return;
    const token = await fetchRefreshToken();
    if (generation !== authGeneration) return;
    setAccessToken(token);
    scheduleTokenRefresh();
  };
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(`${PRODUCT_NAMESPACE}-auth:refresh`, refresh);
  }
  return refresh();
}

/**
 * The server ANSWERED the refresh and said no — as opposed to a request that
 * never got an answer (offline, timeout). Only the former proves there is no
 * session left to revoke; see {@link finishPendingRevoke}.
 */
class RefreshRejectedError extends Error {}

async function fetchRefreshToken(): Promise<string> {
  const response = await authFetch(`${authBase()}${API_ENDPOINTS.AUTH.REFRESH}`, {
    method: 'POST',
    timeout: HTTP.REFRESH_TIMEOUT,
  });

  const data = (await response.json()) as unknown;
  if (!response.ok) {
    const envelope = data as { message?: string; error?: { detail?: string } };
    const message =
      envelope?.error?.detail ??
      envelope?.message ??
      `Refresh failed (${response.status})`;
    throw new RefreshRejectedError(message);
  }

  const payload =
    data && typeof data === 'object' && 'data' in data
      ? (data as { data: unknown }).data
      : data;
  const raw = payload as { access_token?: string; accessToken?: string } | null;
  const token = raw?.access_token ?? raw?.accessToken;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(`Refresh failed (${response.status})`);
  }
  return token;
}

function meContextToAuthUser(ctx: MeContext): AuthUser {
  const name = [ctx.user.firstName, ctx.user.lastName].filter(Boolean).join(' ');
  return {
    id: ctx.user.id,
    email: ctx.user.email,
    role: ctx.globalRole ?? 'user',
    name: name.length > 0 ? name : undefined,
    jobTitle: ctx.user.jobTitle ?? undefined,
    avatarUrl: ctx.user.avatarUrl ?? undefined,
    organizationId: ctx.activeOrganization?.id,
  };
}

async function hydrateSessionFromContext(generation: number): Promise<void> {
  const ctx = await hydrateSessionContext(() => generation === authGeneration);
  if (generation === authGeneration) {
    useAuthStore.getState().setUser(meContextToAuthUser(ctx));
  }
}

async function doSilentRefresh(generation: number): Promise<void> {
  await refreshAccessToken();
  if (generation !== authGeneration) return;
  try {
    await hydrateSessionFromContext(generation);
  } catch (error) {
    if (generation !== authGeneration) return;
    clearAccessToken();
    throw error;
  }
}

export async function establishSession(accessToken: string): Promise<void> {
  const generation = beginAuthGeneration();
  // An interactive sign-in supersedes any sign-out still waiting to reach the
  // server: the old refresh cookie has just been replaced, and a marker left
  // behind would revoke THIS session on the next boot.
  clearRevokePending();
  setAccessToken(accessToken);
  markSessionStart();
  try {
    await hydrateSessionFromContext(generation);
    if (generation === authGeneration) scheduleTokenRefresh();
  } catch (error) {
    if (generation !== authGeneration) return;
    clearAccessToken();
    clearSessionStart();
    throw error;
  }
}

// Derived from `PRODUCT_NAMESPACE`, like the session-start key beside it.
const REVOKE_PENDING_KEY = `${PRODUCT_NAMESPACE}:logout-pending`;

/**
 * "The user signed out, but the server has not been told yet."
 *
 * A flag, never a token. It exists because the revoke is a network call and the
 * commonest moment for an idle sign-out is a laptop waking from sleep — the
 * deadline passes while the lid is shut, and Wi-Fi is not back yet when the
 * timer fires. Local state is cleared either way, but the HttpOnly refresh
 * cookie is still good, so the next load would silently restore the very
 * session the timeout existed to end. The boot path finishes the job instead
 * ({@link finishPendingRevoke}).
 */
function markRevokePending(): void {
  try {
    localStorage.setItem(REVOKE_PENDING_KEY, '1');
  } catch {
    /* storage unavailable (private mode) — the revoke stays best-effort */
  }
}

function clearRevokePending(): void {
  try {
    localStorage.removeItem(REVOKE_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

function isRevokePending(): boolean {
  try {
    return localStorage.getItem(REVOKE_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * POST `/auth/logout` for a session token. Resolves `true` once revoked.
 *
 * `keepalive` is what lets the caller redirect without waiting: {@link forceLogout} hands the tab
 * to `/login` with `window.location.href`, and a plain in-flight fetch dies with the document.
 * A keepalive request is the one kind the browser promises to finish across unload, so the revoke
 * still reaches the server after the user is already looking at the login screen. The response
 * usually arrives too late to observe — which is why the caller marks the revoke pending FIRST and
 * treats this resolving as the bonus, not the guarantee.
 *
 * Takes the token explicitly because the instant path reads it before `clearLocalAuthState()` wipes
 * it: core-be identifies the session to revoke BY the bearer token and 401s without one — expired
 * is fine, absent is not. Without it the refresh cookie survives and the `/login` bootstrap signs
 * the user straight back in.
 */
async function revokeServerSession(
  token: string | null = getAccessToken(),
  options: { keepalive?: boolean } = {},
): Promise<boolean> {
  const res = await authFetch(`${authBase()}${API_ENDPOINTS.AUTH.LOGOUT}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    ...(options.keepalive ? { keepalive: true } : {}),
  });
  if (!res.ok && platformConfig.debugLogging) {
    console.error('[Auth] Server-side session revoke failed', res.status);
  }
  return res.ok;
}

/**
 * Boot-time half of a sign-out whose revoke never landed.
 *
 * The access token lives in memory only, so after a reload there is nothing to
 * revoke WITH. Mint one from the refresh cookie, spend it on `/auth/logout`, and
 * drop it again — the session is never hydrated, so the caller stays a guest.
 * The marker survives only while the outcome is unknown (still offline); a
 * refresh the server REJECTS means there is no session left to revoke.
 */
async function finishPendingRevoke(generation: number): Promise<void> {
  try {
    await refreshAccessToken();
    if (generation !== authGeneration) return;
    if (await revokeServerSession()) clearRevokePending();
  } catch (error) {
    if (error instanceof RefreshRejectedError) clearRevokePending();
  } finally {
    if (generation === authGeneration) {
      cancelTokenRefresh();
      clearAccessToken();
    }
  }
}

let logoutPromise: Promise<void> | null = null;

/**
 * Sign out — revoke the session server-side, then clear everything locally.
 *
 * @remarks
 * The ONE way to end a live session: the user menu, the command palette, the
 * idle-timeout dialog (its "Sign out" button AND its deadline) and the absolute
 * session cap all come through here. `reason` only labels the analytics event.
 *
 * **Single-flight.** The menu item is an async handler with no `disabled` state
 * to speak of, and the command palette and the session-timeout dialog can fire
 * it too. A second call would POST `/auth/logout` again — the first has already
 * cleared the access token by then, so it goes out unauthenticated against a
 * backend that treats refresh-session reuse as an attack. One gesture, one
 * revoke (agent-os/rules/resilient-interactions section 1).
 */
export async function logout(
  opts: { reason?: Exclude<SessionEndReason, 'force_logout' | 'cross_tab'> } = {},
): Promise<void> {
  logoutPromise ??= doLogout(opts.reason ?? 'logout').finally(() => {
    logoutPromise = null;
  });
  return logoutPromise;
}

async function doLogout(reason: SessionEndReason): Promise<void> {
  // Signing out does not wait for the network. This used to await the revoke before handing the
  // tab to /login, so a slow or hanging `/auth/logout` left the user sitting on the app they had
  // just asked to leave — the one moment where a spinner reads as "did that work?".
  //
  // Leaving instantly is only safe because of the two lines below. The refresh cookie is HttpOnly
  // and survives `clearLocalAuthState()`, so a redirect with a live server session would let the
  // /login bootstrap silently refresh and bounce the user back into the app. Marking the revoke
  // pending BEFORE leaving is what stops that: the bootstrap sees the marker, refuses to restore
  // the session, and finishes the revoke itself (`finishPendingRevoke`). Pessimistic on purpose —
  // the marker is cleared only by a revoke we actually saw succeed.
  const token = getAccessToken();
  markRevokePending();
  void revokeServerSession(token, { keepalive: true })
    .then((revoked) => {
      if (revoked) clearRevokePending();
    })
    .catch(() => {
      /* best-effort — the pending marker and the next boot are the real guarantee */
    });
  forceLogout({ reason });
}
