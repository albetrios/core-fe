# `pages/accept-invite` — Membership invitation acceptance

Route: `/accept-invite/$invitationId`. Public entry point a user reaches from an invite
email link.

## Files

| File                        | Responsibility                                                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `accept-invite.route.tsx`   | Route marker — exports `Component` rendering `AcceptInvitePage`.                                                                                                                                                                                                   |
| `accept-invite.manifest.ts` | Page manifest (`path: '/accept-invite/$invitationId'`, `testId`, `kind: leaf`, no permission).                                                                                                                                                                     |
| `AcceptInvitePage.tsx`      | Calls `acceptInvitation(invitationId)`, refreshes the session, sets the active tenant, and redirects to the dashboard. Shows loading / partial / error states, retries a failed accept single-flight, and renders the status card inside a `SectionErrorBoundary`. |

## Flow

1. Read `invitationId` from the route params and the single-use `?token=`.
2. No session yet → `/login` carrying this page (token included) as the redirect.
3. Accept the invitation (server resolves the org + role).
4. Switch to the organization and refresh the session, then land on its dashboard.
5. If that follow-up fails, the membership still stands: report the error, warn the user
   (`partial` state + `notify.warning`), and hand off to `/` — the resolver — never to
   `/login` (INV-1). See `agent-os/rules/resilient-interactions.mdc` section 6.

## Test ids

| Test id                    | Surface                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `accept-invite-page`       | Page container.                                              |
| `accept-invite-loading`    | Spinner while the accept is in flight.                       |
| `accept-invite-success`    | Check icon — shown for both `success` and `partial`.         |
| `accept-invite-error`      | Error icon on the problem card.                              |
| `accept-invite-retry`      | Try again — single-flight; a double-click sends one accept.  |
| `accept-invite-login`      | Go to sign in.                                               |
| `accept-invite-card-error` | `SectionErrorBoundary` fallback when the status card throws. |
