# `pages/accept-invite` — Membership invitation acceptance

Route: `/accept-invite/$invitationId`. Reached from an invite email link, and
**auth-required** (`requireAuth` in the route's `beforeLoad`, INV-4): the recipient is
usually not signed in yet, so a guest goes to sign-in first with the whole link — token
included — carried as the post-login redirect. The error card below is a signed-in state;
a guest never sees it.

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

## Gotcha — the `aliveRef` is set on every mount

The accept is a chain of long awaits, and `aliveRef` stops a finished chain from navigating
or setting state after the user has left (INV-2). Its effect **sets it to `true` as well as
clearing it**: a ref survives React's Strict Mode remount (dev, and therefore every E2E
run), so a cleanup that only ever writes `false` left the page permanently "gone" to itself
— the accept finished and the card sat on "Accepting your invitation…" forever. Production
has no double mount, which is how it went unnoticed. The regression test uses plain
`render` inside `<StrictMode>`; `renderWithProviders` mounts through the router after the
first commit and never double-mounts.

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
