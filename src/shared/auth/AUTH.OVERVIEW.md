# `src/shared/auth/`

Auth runtime — token storage, refresh timer, idle timeout, and login/logout service. Used by the HTTP client, error handler, shared components, and pages alike, so it lives here (reachable by every layer) rather than in `core/`.

## The auth domain map (four homes, by design)

| Concern                                                                | Home                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Screens (login, register, reset, verify, MFA, callback)                | `src/pages/<page>/` islands, wrapped by the pathless `auth-shell` route |
| Runtime mechanism (token, refresh, idle timeout, login/logout service) | `src/shared/auth/` (this folder)                                        |
| Screen schemas + fetchers (shared by all auth islands)                 | `src/shared/api/auth-api.ts`, `auth-contracts.ts`                       |
| Gating (route guards + permission checks)                              | `core/rbac/guards.ts` + `app/guards/` (see `GUARDS.OVERVIEW.md`)        |

The split is the dependency rule at work: core may import this folder (runtime trio), pages may not import each other, and the fetchers sit in `shared/api` because 7 islands share them.

## Files

| File                            | What it does                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `token.ts` (+ .test)            | In-memory access-token holder (read by every request)                                                             |
| `service.ts` (+ .test)          | `login()`, `logout()`, `silentRefresh()`, `refreshAccessToken()`, `forceLogout()` — API + token + store           |
| `refresh-timer.ts` (+ .test)    | Background timer that calls `silentRefresh()` shortly before token expiry                                         |
| `idle-timeout.ts` (+ .test)     | Idle timer: warn, then sign out. Wall-clock anchored, shared across tabs, and deaf to activity while warning      |
| `session-lifetime.ts` (+ .test) | Absolute session cap, plus `hasSessionHint()` — a boot-time guess at which chunks to warm, never an authorization |
| `auth-channel.ts` (+ .test)     | Cross-tab logout broadcast (`BroadcastChannel('core-auth')`) — only logout, never the token                       |
| `types.ts`                      | `AuthUser`, `AuthTokenResponse`, schemas — single source of truth for auth shapes                                 |

The current-session state itself (the `user` + `isAuthenticated`) lives in `src/shared/store/useAuthStore/`.

## The ONE refresh path

`refreshAccessToken()` (service.ts) is the **only** code allowed to call `/auth/refresh`:

- A module-level single-flight promise dedupes concurrent callers — the proactive
  `refresh-timer`, any number of simultaneous 401s in `core/http/fetch-client.ts`, and the
  boot `silentRefresh()` all await the **same** in-flight request.
- A `navigator.locks` Web Lock (`core-auth:refresh`) serializes refreshes **across tabs**
  (falls back to in-tab dedupe where Web Locks is unavailable).
- Why it matters: the backend rotates refresh sessions with reuse-detection — two parallel
  refreshes look like token theft and kill the whole session. Never add a second caller.
- A failed refresh means the session is gone: callers run `forceLogout()`, which clears
  local auth state, broadcasts logout to every tab via `auth-channel.ts`, and hard-redirects
  to `/login`.

## Ending a session: `logout()` vs `forceLogout()`

Two functions, and picking the wrong one produces a sign-out that does not sign
anybody out.

- **`forceLogout()` is LOCAL ONLY.** It clears this tab's token and stores,
  broadcasts to sibling tabs and redirects to `/login` — and leaves the HttpOnly
  refresh cookie valid. Called for a session that is still alive, `/login` boots,
  the silent refresh succeeds, and the guest-only guard sends the user straight
  back to the dashboard. It is right only when the server session is **already
  gone**: a dead session in the fetch client, a deleted account, or the tail of
  `logout()` itself.
- **`logout({ reason })` is the ONE way to end a live session.** It dispatches
  the revoke (`POST /auth/logout` with the bearer) and calls `forceLogout()`
  **without waiting for it**. The user menu, the command palette, **the
  idle-timeout dialog (its button AND its deadline) and the absolute session
  cap** all go through it. `reason` (`logout` · `idle_timeout` ·
  `session_expired`) only labels the `session_ended` analytics event. It is
  single-flight: one gesture, one revoke.

**Signing out does not wait for the network, and the marker is why that is
safe.** Awaiting the revoke first left the user on the app they had just asked
to leave whenever `/auth/logout` was slow. Three things make the instant
redirect correct rather than merely faster: the bearer is read **before**
`clearLocalAuthState()` wipes it; `core:logout-pending` is written **before**
the redirect, so the `/login` bootstrap refuses to restore the session it would
otherwise silently refresh back into; and the request goes out with
`keepalive`, the one kind a browser finishes across the document unload that
`forceLogout()`'s `window.location.href` causes. The marker is cleared only by
a revoke actually observed to succeed — usually the next boot's, since the
response rarely arrives before the page is gone.

**A revoke that cannot reach the server is finished at the next boot.** The
commonest moment for an idle sign-out is a laptop waking past its deadline with
Wi-Fi not back yet. `logout()` then records a `core:logout-pending` flag (a
boolean, never a token), and `startAuthBootstrap()` checks it before anything
else: it mints a token from the refresh cookie, spends it on `/auth/logout`, and
drops it — the session is never hydrated, so the caller stays a guest. The flag
survives only while the outcome is unknown (still offline); a refresh the server
_rejects_ means there is nothing left to revoke, and an interactive sign-in
clears it so it can never revoke the new session.

**A deliberate end also suppresses auto-Google sign-in** for the tab
(`skipAutoGoogleSignIn()`), including in sibling tabs that hear the logout
broadcast. With auto-Google on, `/login` starts OAuth by itself and a live Google
session would sign the user back in without a click. A dead session
(`force_logout`) keeps the convenience — nobody asked to leave.

## The idle timer

`startIdleTimeout()` returns a handle — `extend()` ("Stay signed in") and
`stop()` — and guarantees three things, each of which was once a bug:

1. **The warning is not dismissed by activity in this tab.** The activity
   listeners sit on `document`, so a press on the dialog's own "Sign out" button
   _is_ activity: it used to end the warning on `mousedown`, the dialog closed
   under the pointer and the `click` never landed (Tab + Enter died the same
   way). Once warned, only an explicit choice continues the session.
2. **Idle time is wall-clock time.** Timers do not run while a laptop sleeps and
   are throttled in background tabs, so every checkpoint (a timer, the tab
   becoming visible, window focus) re-reads the clock. A machine that wakes past
   the deadline is signed out at once; one that wakes inside the warning window
   is warned with the **remaining** grace. `onWarn` receives `logoutAt`, the one
   source of truth the dialog's countdown reads.
3. **Activity is shared across tabs** (`storageKey`, `core:last-activity` — a
   timestamp). The session is one per browser but the timer is one per tab:
   unshared, a background tab counts itself idle and signs the user out of the
   tab they are working in. `onActive` now fires **only** for activity in another
   tab.

Browser proof: `tests/e2e/session-timeout.e2e.test.ts` (virtual clock). The unit
suite that mocks the timer cannot see bug 1 — it lived _between_ the two modules;
`SessionTimeoutDialog.sign-out.test.tsx` wires them together and commits between
`mousedown` and `click` the way a browser does.

## Why not `core/`

`core/` is reserved for framework-agnostic _platform_ services that don't know about React or any specific app concern. Auth has app-specific knowledge (the API shape, the user shape) and needs to be reachable by every layer:

- `core/http/fetch-client` — reads the token on every request; on 401 it awaits the
  shared `refreshAccessToken()` and calls `forceLogout()` for dead sessions
- `shared/components/SessionTimeoutDialog` — reads auth state, runs the idle timer + the
  absolute cap, and ends the session through `logout()` (never `forceLogout()` alone)
- `shared/components/PermissionGuard` — reads `isAuthenticated`
- Most pages — call `login()`, `logout()`, read user

If it lived in `pages/`, the HTTP client (which is in core) couldn't reach it. If it lived in `core/`, app-specific types would pollute the platform layer. `shared/auth/` is the right home.

## Why not in the auth pages

The auth pages (`pages/login/`, `pages/mfa/`, …) hold the _screens_ where users authenticate; their fetchers live in `shared/api/auth-api.ts` (cross-island, so promoted to shared). `shared/auth/` holds the _mechanism_ they all call. Same distinction as page fetchers vs `core/http/fetch-client.ts` (the HTTP client itself).
