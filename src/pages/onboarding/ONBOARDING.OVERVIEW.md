# `pages/onboarding` — Post-signup onboarding wizard

Route: `/onboarding`. Where **every** freshly authenticated user lands once, in any
deployment mode — gated by the backend `user.onboarding_completed` flag, not by
whether the user has a workspace (personal deployments auto-provision an org yet
still onboard). The `/onboarding` `beforeLoad` in `app/routes/routeTree.tsx` wires
`requireAuth` + `requireOnboardingWorkspace` (`app/guards/route-guards.ts`); the `/`
resolver redirects here via `resolveRootRedirect`
(`shared/tenancy/organization-resolver.ts`). That guard also **claims the persisted
wizard for the signed-in user** (`useOnboardingStore.claimForUser`) before this page
renders, wiping progress a different user left on the same browser — the page itself no
longer does it, so no previous user's name or workspace paints for a frame (ONB-4). Only
the wizard steps differ per mode.

## Files

| File                      | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `onboarding.route.tsx`    | Route marker — exports `Component` rendering `OnboardingPage`.                                                                                                                                                                                                                                                                                                                                                                       |
| `onboarding.manifest.ts`  | Page manifest — `testId` + document title from `onboarding.constants.ts` + i18n.                                                                                                                                                                                                                                                                                                                                                     |
| `onboarding.constants.ts` | i18n keys, test ids, analytics events, API defaults for this island.                                                                                                                                                                                                                                                                                                                                                                 |
| `OnboardingPage.tsx`      | Multi-step wizard (welcome → profile → questions → workspace → invite → done; steps derived per mode). Reads/writes progress from `@/shared/store/useOnboardingStore/` so a refresh resumes mid-flow. On finish it creates the org (team modes), marks onboarding complete (`POST /users/me/onboarding/complete`) **before** refreshing `me/context`, activates the workspace, and navigates **directly** to the resolved dashboard. |

Step UIs live in `components/` (folder-per-unit): `WelcomeStep`, `ProfileStep`
(**first name + last name** — maps 1:1 to core-be `first_name` / `last_name`),
`QuestionsStep` (optional team-size / use-case / referral chips), `WorkspaceStep` (org name +
live `core.app/<slug>` preview, work-email-domain prefill), `InviteStep` (validated teammate
emails), `DoneStep`, plus `StepIndicator`.

`WorkspaceStep`'s slug is validated **at that step**, against the same schema
`createOrganization` uses (`isValidWorkspaceSlug` in `onboarding-flow.ts`): an uppercase
or spaced slug blocks Continue instead of passing it and only blowing up two steps later
at Finish, as a generic error (ONB-6). An empty slug stays valid — the backend derives one.

## Finish flow (idempotent + best-effort)

`finish()` is safe to retry. The created org id is stashed in the store the moment creation
succeeds, so a retry after a partial failure **reuses** it instead of creating a duplicate.
Invitations are sent with `Promise.allSettled` — a single bad address never strands the user;
failures are surfaced as a toast and resendable from Members. Profile (first + last name) and
the qualifying-question answers are persisted **best-effort** (`authApi.updateProfile` +
a PostHog `onboarding_completed` segmentation event) and never block dashboard entry.

The stored org id is re-checked against the user's real organizations before it is
trusted — a persisted id from an earlier session can name an org the user no longer
belongs to, and navigating to its slug 404s. That check reads the organization list
**through the query cache** (`readMyOrganizations`, `staleTime` 10s) under
`myOrganizationsQueryKey`, so the stale-created-org effect and the finish path share one
response, in the one cache the picker, the switcher and Settings read (ONB-10). A
`staleTime` rather than `ensureQueryData`, because answering "does this org still exist"
from an arbitrarily old cache entry would drop a real organization and create a duplicate.
An org created inside that window marks the cached list stale on the spot, so a retry
re-reads it from the server and is never told the org it just made does not exist.

Two latches keep a repeat click from re-running the writes. `finishingRef` is the
synchronous twin of `submitting`: `disabled` only lands a render later, so a double-click
would otherwise fire `finish()` twice before the button greys out. `finishedContextRef`
covers the longer window after that — `finishingRef` clears the moment the post-finish
navigation _starts_, while the destination's guard chain is still on the network and the
wizard is still mounted and clickable. Once a finish has succeeded, that ref holds the
context it resolved and a further click **replays the navigation** rather than re-sending
the profile PATCH, `completeOnboarding`, the org switch, the analytics event and every
invitation. It is a mount-scoped ref, not the store's persisted `completed` flag, which
would permanently dead-end a user whose store says done while the guard still routes them
here. `useReleaseFinishLatchOnReturn` disarms it once the router settles back on
`/onboarding` — the bounce case, where the destination refused us and a still-armed latch
would leave the wizard un-finishable.

After activating the workspace (`switchToOrganization` for a created team, or
`switchToPersonal` when a personal workspace exists), `finish()` navigates **directly** to the
resolved target via `resolveRootTarget(post-switch context)` — no bounce through the `/`
resolver (which would re-fetch `me/context` and add a second redirect, flashing `/login` /
`/onboarding` in between). The personal switch is gated on the concrete `personalOrganizationId`
so a personal-enabled-but-unprovisioned user never fires a 404-ing `switch-to-personal`
(core-be self-heals the missing personal org; the FE stays defensive). Modes: **team-only**
creates + lands on the team dashboard; **personal-only** / **personal-and-team** land on
`/dashboard`; a genuinely workspace-less state defers to `/` rather than self-looping.

## State

Wizard progress (current step, collected data, `createdOrganizationId` +
`createdOrganizationSlug`, and the `forUserId` owner the route guard stamps) lives in
`useOnboardingStore` (Zustand, persisted to `localStorage`) so a refresh resumes mid-flow.
Server writes (create org, invitations, profile) go through the normal API layer, not the store.
