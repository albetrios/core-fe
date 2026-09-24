# `pages/mfa` — TOTP verification step

Route: `/mfa`. Where users land after a successful primary login when MFA is enabled
on their account. When `authApi.login` sees `mfa_required`, it throws
`MfaRequiredError` carrying the short-lived `mfa_session_token`; `LoginForm` catches
it and routes here with that token in router location state (as `mfaToken`). This
page posts the token plus a 6-digit TOTP code to `POST /auth/mfa/login` (public) to
obtain a real access token, then redirects to `/`.

## Files

| File              | Responsibility                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mfa.route.tsx`   | Route marker — exports `Component` rendering `MfaPage` inside `AuthLayout`.                                                                            |
| `mfa.manifest.ts` | Page manifest — `kind: 'leaf'`, path `/mfa`, no permission required.                                                                                   |
| `MfaPage.tsx`     | Thin wrapper that mounts `MfaForm` behind a `SectionErrorBoundary` and exposes `data-testid="mfa-page"`.                                               |
| `forms/MfaForm/`  | Code input form, calls `authApi.mfaVerify` (→ `POST /auth/mfa/login`), sets the access token, fetches the user, schedules refresh, and navigates home. |

## Test IDs

| ID                        | Surface                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `mfa-page`                | Page container.                                             |
| `mfa-form`                | The form (also the "session expired" variant).              |
| `mfa-code`                | Code entry — OTP boxes, or the text input in recovery mode. |
| `mfa-submit`              | Verify button.                                              |
| `mfa-toggle-recovery`     | Switch between authenticator code and recovery code.        |
| `form-error`              | API error banner.                                           |
| `mfa-form-boundary-error` | Section-boundary fallback when the form itself throws.      |

## Resilience

Two standing rules from `agent-os/rules/fe-resilient-interactions.mdc` apply here, and
both are covered by regression tests that fail if the guard is removed:

- **Single-flight (rule 1).** The MFA session token is **single use**, so a duplicate
  verify spends a token core-be has already burned and fails the sign-in the first
  request just won. `disabled={pending}` is only the affordance; `verifyingRef` is the
  guarantee — it latches synchronously, so a double-click or a second `onComplete`
  from the code boxes inside the same frame never reaches the API. The latch is
  released **only** on failure. On success it is held, and `handedOff` keeps the form
  pending across the awaited `navigate()`, so "Verifying..." never flips back to an
  armed "Verify" while the route is still swapping.
- **Contained crash (rule 2).** `MfaPage` wraps the form in `SectionErrorBoundary`.
  Without it a throw in the code entry escalates to the route boundary and replaces
  the whole auth screen mid-login — a dead end the user cannot restart without fresh
  credentials.

## State

No page-local Zustand store. The `mfaToken` is read from `useLocation().state`
(set by `LoginForm` on the MFA challenge response). Auth state writes go through
`useAuthStore` and the shared token helpers in `@/shared/auth/`.
