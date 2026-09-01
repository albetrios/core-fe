# Low-Severity State & Flicker Issues — core-fe

The 31 low-severity findings from the login-to-settings audit. Same format as
`HIGH-SEVERITY-ISSUES.md` and `MEDIUM-SEVERITY-ISSUES.md`: what goes wrong, why, and
the fix.

**Audit date:** 31 August 2026 · **Scope:** `core-fe`, every route from `/login`
through the settings modal.

> **Count note.** The published audit listed 27 low. This document has **31** — the
> four extra come from the loading-text sweep done afterwards (LOAD-1 … LOAD-4), which
> found two untranslated strings, a visible ellipsis inconsistency, and three dead
> translation keys.

---

## What "low" means here

None of these will lose data, block a user, or produce a wrong outcome. They are
polish, consistency, hygiene and accessibility — the things that make the difference
between software that works and software that feels finished.

Two groups are worth pulling out of the list and treating as single pieces of work
rather than individual tickets:

- **Untranslated copy** (PICK-3, X-9, LOAD-1, LOAD-2) — every one of these stays
  English in all 11 locales. Fix them in one sweep, since each needs the same
  `sync:check` round trip across every locale file.
- **Swallowed errors** (SHELL-12, ONB-11, LOGIN-10) — small, individually harmless,
  but each one removes a signal you would want during an incident.

---

## Quick index

| ID       | Area            | One-line summary                                           |
| -------- | --------------- | ---------------------------------------------------------- |
| LOGIN-8  | `/login`        | Shake animation can't replay; timer outlives the component |
| LOGIN-9  | `/login`        | Focusing the email field wipes the OAuth error             |
| LOGIN-10 | `/login`        | A blocked OAuth redirect leaves the form disabled forever  |
| MFA-2    | `/mfa`          | Successful MFA verify gives no confirmation                |
| ONB-9    | `/onboarding`   | Step list silently changes shape without loaded context    |
| ONB-10   | `/onboarding`   | Organization list fetched twice, outside the cache         |
| ONB-11   | `/onboarding`   | Profile-name save fails silently                           |
| ONB-12   | `/onboarding`   | Card entrance animation never plays in dev                 |
| ONB-13   | `/onboarding`   | Every keystroke re-renders the whole wizard                |
| PICK-2   | `/organization` | Skeletons flash on fast responses                          |
| PICK-3   | `/organization` | Picker copy is hardcoded English                           |
| SHELL-8  | App shell       | Sidebar org switcher is the only one without a boundary    |
| SHELL-9  | App shell       | Chosen dashboard arrangement reverts on reload             |
| SHELL-10 | App shell       | Notifications poll before org context exists               |
| SHELL-11 | App shell       | `useVisibleNav` returns a new array every render           |
| SHELL-12 | App shell       | Logout failure swallowed; personal org dropped from ⌘K     |
| DASH-2   | Dashboard       | Chart and roster share one error boundary                  |
| SET-20   | Settings        | Three panels show errors with no retry                     |
| SET-21   | Settings        | Empty session list renders nothing at all                  |
| SET-22   | Settings        | Skeletons are much shorter than the content                |
| SET-23   | Settings        | Permission-gated buttons pop in late                       |
| SET-24   | Settings        | Removing one passkey disables every row                    |
| SET-25   | Settings        | Step-up send failure says "invalid code"                   |
| SET-26   | Settings        | Webhook dialog Cancel stays live during submit             |
| SET-27   | Settings        | Logo upload gives no feedback while reading the file       |
| X-8      | Shared          | `I18nProvider` can white-screen after splash dismiss       |
| X-9      | Shared          | Several error and status screens are hardcoded English     |
| LOAD-1   | Shared          | "Loading roles…" is hardcoded English                      |
| LOAD-2   | Settings        | "Loading…" on the payment button is hardcoded English      |
| LOAD-3   | Shared          | "Verifying..." vs "Verifying…" on two screens              |
| LOAD-4   | Shared          | Three progress keys shipped in 11 locales, never used      |

---

## 1 · Login — `/login`

### LOGIN-8 — Shake animation can't replay; timer outlives the component

**What happens.** After a failed code entry the input shakes. A second failure in
quick succession does not replay the shake. If the user navigates away or hits
"change email" inside the window, a state update fires on an unmounted component.

**Why.** `AuthEmailPanel.tsx:246` and `MfaForm.tsx:68` both do:

```ts
window.setTimeout(() => setCodeShake(false), 450);
```

The id is never held, so nothing can clear or restart it.

**Fix.** Hold the id in a ref and clear it on cleanup and before re-arming. Better
still, drive the reset from `onAnimationEnd`, which removes the timing duplication
between CSS and JS entirely.

---

### LOGIN-9 — Focusing the email field wipes the OAuth error

**What happens.** The user sees "Google sign-in failed", moves to the email field to
try another way, and the message vanishes before they have read it.

**Why.** `AuthForm.tsx:139` — `cancelAutoGoogle` calls `setFormError(null)` — and it
is reached from `AuthEmailPanel.tsx:286` via `onFocus={() => onInteract?.()}`.
Cancelling the auto-Google timer and clearing the method error banner are two
different concerns sharing one function.

**Fix.** Split them. `cancelAutoGoogle` should cancel the timer and the pending state;
clearing `formError` belongs on the next explicit auth attempt, not on focus.

---

### LOGIN-10 — A blocked OAuth redirect leaves the form disabled forever

**What happens.** If `window.location.assign` is blocked or deferred — a popup
blocker, an extension, a slow navigation — the whole form stays disabled with no way
to recover short of a reload.

**Why.** `AuthForm.tsx:114–123` calls `setPending(...)` and then
`window.location.assign(url)`. Nothing resets `pending` if the navigation never
happens, and there is no path back.

**Fix.** Arm a watchdog before the redirect:

```ts
const t = window.setTimeout(() => {
  setPending(null);
  setFormError(t(AUTH_KEYS.auth.redirectBlocked));
}, 5000);
```

If the navigation succeeds the page is gone and the timer is irrelevant.

---

## 2 · MFA — `/mfa`

### MFA-2 — Successful MFA verify gives no confirmation

**What happens.** A correct TOTP code establishes the session and navigates with no
feedback of any kind. The sibling email flow _does_ toast on code send
(`AuthEmailPanel.tsx:203–205`), so the two auth paths feel different.

**Why.** `MfaForm.tsx:60–63` navigates directly with no success surface.

**Fix.** Pick one convention and apply it to both. A success toast that is immediately
covered by a navigation is arguably noise, so the better resolution may be to drop the
one in the email flow rather than add one here — the point is that the two should
match.

---

## 3 · Onboarding — `/onboarding`

### ONB-9 — Step list silently changes shape without loaded context

**What happens.** Nothing visible today. But `deriveOnboardingSteps(deploymentFlags,
meContext ?? null)` (`OnboardingPage.tsx:348`) yields a _different_ step list when
`meContext` is undefined — `hasTeamOrganization` returns false, dropping the invite
step.

**Why.** The only reason no step-jump is visible is that `onboardingRoute.beforeLoad`
→ `requireOnboardingWorkspace()` → `ensureSessionContext()` warms the same query key
on the same singleton `queryClient` before render. Nothing documents or enforces that
ordering.

**Fix.** Make the invariant explicit — gate the wizard body on `meContext` being
present (which ONB-2 in the high list requires anyway), or assert it in a route
loader. Right now a future route that skips the guard reintroduces a visible dot-count
change and a step remap.

---

### ONB-10 — Organization list fetched twice, outside the cache

**What happens.** `listMyOrganizations()` is called twice on the finish path, both
times as a raw fetcher bypassing TanStack Query.

**Why.** `OnboardingPage.tsx:377` (mount validation effect) and `:132` (inside
`resolveOrganizationForFinish`) each call it directly.

**Fix.** Route both through the cache so they dedupe and participate in invalidation:

```ts
await queryClient.ensureQueryData({
  queryKey: ['organizations'],
  queryFn: listMyOrganizations,
});
```

Pairs naturally with ONB-7 in the medium list, which adds the matching invalidation.

---

### ONB-11 — Profile-name save fails silently

**What happens.** The user types their name during onboarding, the profile update
fails, and nothing is said. The dashboard then greets them by their email prefix
instead of the name they just entered — which reads as the product ignoring them.

**Why.** `OnboardingPage.tsx:106–108`:

```ts
} catch { /* profile update is best-effort */ }
```

This is deliberate and documented at `:79–83`, and treating it as non-blocking is the
right call. Being _invisible_ is the part that isn't.

**Fix.** Keep it non-blocking but observable: `reportError(err)` at minimum, ideally a
`notify.warning` telling the user their name did not save and where to set it. "Best
effort" should still mean "someone finds out when it fails".

---

### ONB-12 — Card entrance animation never plays in dev

**What happens.** Dev-only. The onboarding card's entrance animation never runs
locally, which makes it impossible to iterate on.

**Why.** `useOnboardingStepMotion.ts:38–42` sets `cardEntranceDone.current = true`
_before_ the animation starts, so StrictMode's second invoke sees `true` and calls
`settleMotionTarget` instead of animating.

**Fix.** Set the flag in the animation's completion callback, or reset it in the
effect cleanup so the second invoke behaves like the first.

---

### ONB-13 — Every keystroke re-renders the whole wizard

**What happens.** Typing a single character in any onboarding field re-renders
`OnboardingPage`, `StepIndicator` and all step children.

**Why.** `OnboardingPage.tsx:334–345`, `ProfileStep.tsx`, `WorkspaceStep.tsx:20`,
`InviteStep.tsx:22` and `QuestionsStep.tsx` all call `useOnboardingStore()` with **no
selector**, so every component subscribes to the entire store.

**Fix.** Select slices, or use `useShallow` for multi-field reads:

```ts
const firstName = useOnboardingStore((s) => s.data.firstName);
```

Not user-visible at this size, but it is the pattern that stops scaling first as the
wizard grows.

---

## 4 · Organization picker — `/organization`

### PICK-2 — Skeletons flash on fast responses

**What happens.** Two skeleton rows render even for a 40 ms cached response, so a
fast load looks like a stutter.

**Why.** `OrganizationPickerPage.tsx:46–51` renders skeletons unconditionally while
`isLoading`, with no minimum-duration or delay threshold.

**Fix.** Either delay the skeleton by ~150 ms so fast responses never show it, or
better, seed `placeholderData` from the `meContext` already in cache from the route
guard — the organization list is usually known before this page renders.

---

### PICK-3 — Picker copy is hardcoded English

**What happens.** "Select organization", "We couldn't load your organizations…", "Try
again" and "Create organization" stay English in all 11 locales.

**Why.** `OrganizationPickerPage.tsx:39–42, 57–60, 76–78, 118` use string literals
instead of `useTranslation`. Same in `CreateOrganizationDialog.tsx:110–113, 156`.

**Fix.** Move to translation keys. Batch with X-9, LOAD-1 and LOAD-2 — they all need
the same round trip across every locale file to pass `sync:check`.

---

## 5 · App shell

### SHELL-8 — Sidebar org switcher is the only one without a boundary

**What happens.** A render error in the sidebar's organization switcher takes down the
entire shell instead of one widget.

**Why.** `AppLayoutSidebar.tsx:77–83` renders `<OrganizationSwitcher surface="sidebar" />`
bare. Every other instance — the mobile one at `:136–143`, plus
`AppLayoutFocus.tsx:47–55`, `AppLayoutTopNav.tsx:35–43` and `AppLayoutRail.tsx:64–71`
— is wrapped in `SectionErrorBoundary`. This one was missed.

**Fix.** Wrap it like the others. (Note X-1 in the high list: these boundaries do not
currently catch _query_ failures at all, so fix that too or this wrapping buys less
than it appears to.)

---

### SHELL-9 — Chosen dashboard arrangement reverts on reload

**What happens.** A user picks a dashboard arrangement in the Appearance panel, or
gets one from Shuffle, and it silently reverts to Classic on the next reload.

**Why.** `useThemeStore.ts:239–252` — `partialize` omits `dashboardVariant`, unlike
its sibling preview axes. `appVariant`, `authVariant` and `publicVariant` are
deliberately stripped in `migrate` (`:232–234`), so this reads as an oversight rather
than a decision.

**Fix.** Decide which it is. If the dashboard arrangement is a real preference, add it
to `partialize`; if it is a preview axis like the others, strip it in `migrate` so the
behaviour is consistent and intentional.

---

### SHELL-10 — Notifications poll before org context exists

**What happens.** Both notification queries poll every 30 seconds against a null org
scope before context resolves, and on personal deployments.

**Why.** `useNotifications.ts:24–41` sets `refetchInterval` with no
`enabled: Boolean(orgId)` gate — unlike `useMembers.ts:31–37`, which does exactly
that and documents why.

**Fix.** Mirror the gate from `useMembers`.

---

### SHELL-11 — `useVisibleNav` returns a new array every render

**What happens.** Nothing visible today — the nav has one item.

**Why.** `useCan.ts:52–59` does `items.filter(...)` with no memoisation, so `navItems`
is a fresh reference on every `AppLayout.Component` render, re-rendering the shell
subtree.

**Fix.** `useMemo` on the store slices. Worth doing before anyone adds `memo` to shell
components and wonders why it does nothing.

---

### SHELL-12 — Logout failure swallowed; personal org dropped from ⌘K

**What happens.** Two small things in the command palette. A failed logout is silent —
the user clicks "Log out", it fails, and they stay signed in with no explanation. And
the personal workspace never appears in the palette's organization list.

**Why.** `CommandPalette.tsx:284` — `logout().catch(() => {})`. And
`CommandPaletteOrgGroup.tsx:37` — `.filter((org) => org.slug)` silently drops the
personal org, which has no slug by design.

**Fix.** Surface the logout failure with a toast. For the org list, include the
personal workspace with its own route (`/dashboard`) rather than filtering it out —
the filter is presumably there because the code assumes a slug-based URL.

---

## 6 · Dashboard

### DASH-2 — Chart and roster share one error boundary

**What happens.** If the analytics chart fails, the members roster disappears with it,
and vice versa. One failure costs two widgets.

**Why.** `Dashboard.shared.tsx:238–269` places `DeferredAnalyticsChart` and
`DeferredMembersTable` inside a single `SectionErrorBoundary`, and all three
arrangement variants route through it (`DashboardClassic.tsx:49–63`,
`DashboardCommandCenter.tsx:47–50`, `DashboardPulse.tsx:41–55`).

**Fix.** Move the boundary inside each `Deferred*` component so widgets fail
independently. That is the whole point of section-level boundaries.

---

## 7 · Settings — `#settings/…`

### SET-20 — Three panels show errors with no retry

**What happens.** API keys, sessions and notification preferences render a plain
sentence on failure with no way to retry, so a transient blip means closing and
reopening Settings. Members and roles do offer a retry.

**Why.** `OrganizationIntegrationsPanel.tsx:89–93`, `AccountSessionsPanel.tsx:39–43`
and `AccountNotificationsPanel.tsx:145–149` render text where the other panels use
`RetryError`.

**Fix.** Use `RetryError` consistently. The component already exists and is already
used two panels over.

---

### SET-21 — Empty session list renders nothing at all

**What happens.** With no active sessions, the skeleton disappears into blank space —
no message, no explanation.

**Why.** `AccountSessionsPanel.tsx:45` renders only when
`sessions && sessions.length > 0`, with no `else`.

**Fix.** Add an empty state. Empty is a legitimate outcome and should look
intentional, not like a failed render.

---

### SET-22 — Skeletons are much shorter than the content

**What happens.** Panels visibly jump when data lands, because the placeholders are a
fraction of the height of what replaces them.

**Why.** `AccountNotificationsPanel.tsx:137–143` renders four `h-12` skeletons for
content that is four category blocks — heading, description and switch row, roughly
three times taller. `AccountSessionsPanel.tsx:31–37` and
`OrganizationIntegrationsPanel.tsx:218` are similarly undersized.

**Fix.** Match the skeleton geometry to the rendered rows. The dashboard already does
this well (`Dashboard.tsx:16–29` mirrors hero, KPI tiles and panel heights) — copy
that approach.

---

### SET-23 — Permission-gated buttons pop in late

**What happens.** Invite, New role and row-action buttons are hidden on first paint
and pop in a moment later, so the toolbar visibly rearranges.

**Why.** `PermissionGuard.tsx:34` and `useCan.ts:40–45` read permissions synchronously
from Zustand, which is still empty while the org guard populates it. "No permission"
and "permissions not loaded yet" render identically.

**Fix.** Render a disabled placeholder while permissions are unresolved rather than
nothing, so the layout is stable and the control appears in place.

---

### SET-24 — Removing one passkey disables every row

**What happens.** Removing a passkey disables the remove button on _all_ passkey rows,
so the user cannot tell which one is in flight.

**Why.** `AccountSecurityPanel.tsx:391` applies `disabled={remove.isPending}` to every
row rather than the one being removed.

**Fix.** Compare against the id currently being removed:

```tsx
disabled={remove.isPending && remove.variables === credential.id}
```

---

### SET-25 — Step-up send failure says "invalid code"

**What happens.** If the step-up verification email fails to _send_, the dialog tells
the user their code is invalid — before they have entered one.

**Why.** `StepUpDialog.tsx:186` — the `sendEmailCode` catch reuses the invalid-code
message:

```ts
.catch(() => setError(t(keys.invalid)));
```

**Fix.** Give send failures their own message and a resend action. "We couldn't send
your code" and "that code is wrong" call for completely different user responses.

---

### SET-26 — Webhook dialog Cancel stays live during submit

**What happens.** During webhook creation the Cancel button remains enabled, so the
dialog can be dismissed mid-request. And a server-side failure only ever appears as a
toast, never inline next to the form that caused it.

**Why.** `OrganizationIntegrationsPanel.tsx:302–304` — submit is correctly guarded at
`:307`, but Cancel is not. The inline `error` at `:295–299` is zod-only, so server
errors have nowhere to render.

**Fix.** Disable Cancel while pending, and render the mapped server error inline
alongside the validation errors.

---

### SET-27 — Logo upload gives no feedback while reading the file

**What happens.** Uploading a large organization logo looks like nothing happened —
there is a gap between choosing the file and anything appearing.

**Why.** `OrganizationGeneralPanel.tsx:70–78` — `disabled={update.isPending}` covers
the upload request but not the `FileReader` phase that precedes it.

**Fix.** Add a reading state that covers the `FileReader` window, so the control is
busy from the moment the file is chosen.

---

## 8 · Cross-cutting

### X-8 — `I18nProvider` can white-screen after splash dismiss

**What happens.** Latent. If locale hydration never completes, the boot splash is
dismissed onto a bare background with no spinner and no error.

**Why.** `I18nProvider.tsx:28` returns `null` until `useLocaleStore.persist` finishes
hydrating, while `main.tsx:128` (`afterPaint(() => dismissAppSplash())`) removes the
splash unconditionally two frames after mount. This is safe _today_ only because the
store uses synchronous `localStorage`, so `hasHydrated()` is already true on first
render. It stops being safe if the storage becomes async — IndexedDB, a remote
profile — or if `migrate` (`:155`) throws.

**Fix.** Add a hydration timeout that falls through to the default locale, or hold the
splash until `ready`. `return null` for a whole-app provider should always have a
fallback and a time limit.

---

### X-9 — Several error and status screens are hardcoded English

**What happens.** These screens stay English regardless of the selected locale.

**Why.** String literals instead of translation keys at `SuspendedPage.tsx:22–29`,
`UnauthorizedPage.tsx:17, 34`, `OrganizationGeneralPanel.tsx:173`,
`AppearanceDialog.tsx:78–82, 93`, `ThemeModeToggle.tsx:80–93` and
`AccountNotificationsPanel.tsx:128–134`.

**Fix.** Move to translation keys across all 11 locales. Note the pattern: it is the
_error and status_ screens that were missed, which are exactly the screens a user is
most stressed on when they reach them.

---

## 9 · Loading-text sweep

Four findings from a follow-up pass over every place the app shows loading text.

### LOAD-1 — "Loading roles…" is hardcoded English

**What happens.** The invite dialog shows "Loading roles…" in English in every locale.

**Why.** `InviteMemberDialog.tsx:92` is a literal:

```tsx
<p className="text-muted-foreground text-sm" data-testid="invite-member-loading">
  Loading roles…
</p>
```

**Fix.** Move to a key. Better still, replace the text with a skeleton matching the
role selector's shape — a text placeholder in a form is a layout shift waiting to
happen.

---

### LOAD-2 — "Loading…" on the payment button is hardcoded English

**What happens.** The add-payment-method button label switches to English "Loading…"
mid-action in every locale.

**Why.** `BillingPaymentMethods.tsx:166`:

```tsx
{
  isAdding ? 'Loading…' : 'Add payment method';
}
```

**Fix.** Use a key — and prefer the `Button` component's own `isLoading` prop
(`button.tsx:45–70`), which renders a spinner, sets `aria-busy`, and keeps the label
stable so the button does not change width mid-click.

---

### LOAD-3 — "Verifying..." vs "Verifying…" on two screens

**What happens.** The MFA screen renders "Verifying**...**" with three periods while
the step-up dialog renders "Verifying**…**" with a true ellipsis. Same word, two
screens, two glyphs.

**Why.** `auth.json` → `mfa.verifying = 'Verifying...'` (used at `MfaForm.tsx:165`)
versus `settings.json` → `security.stepUp.verifying = 'Verifying…'`.

**Fix.** Standardise on the true ellipsis character `…` and sweep all 11 locales. The
same split exists between `common.sending` (`'Sending...'`) and
`common.sendingEllipsis` (`'Sending…'`), which is presumably how the second key came
to exist at all.

---

### LOAD-4 — Three progress keys shipped in 11 locales, never used

**What happens.** No user impact. `common.sending`, `common.verifying` and
`common.pleaseWait` are translated and shipped in all 11 locale files but never
rendered.

**Why.** They are declared in `auth-shell.constants.ts:28–31` and referenced nowhere
else in `src/`. `common.sendingEllipsis` appears to be the replacement for
`common.sending`, with the original left behind.

**Fix.** Delete all three keys and their constants, across every locale. Dead
translation keys cost real money and reviewer attention every time the locale files
are touched.

---

## Suggested order

These are low severity, so the ordering is about batching rather than urgency:

1. **One i18n sweep — PICK-3, X-9, LOAD-1, LOAD-2, LOAD-3, LOAD-4.** All six touch the
   locale files, all six need the same `sync:check` round trip across 11 locales.
   Doing them as one change is far cheaper than six.
2. **One error-visibility sweep — SET-20, SET-21, SHELL-12, ONB-11, LOGIN-10.** Each
   is a missing retry, empty state, or swallowed error, and they share a shape.
3. **One skeleton/layout sweep — SET-22, SET-23, PICK-2, LOAD-1.** All are placeholder
   geometry and timing.
4. **Everything else opportunistically** — most are one-line fixes best done while
   already in the file for another reason.

`SHELL-9` deserves a decision rather than a fix: someone needs to say whether the
dashboard arrangement is a saved preference or a preview axis. The bug is the
ambiguity, not the missing line.

---

## Patterns behind these

The low list is dominated by three of the same shapes seen higher up, plus one that is
specific to this tier:

- **A default stands in for "unknown"** — SET-23, ONB-9. "Not loaded yet" renders
  identically to "no permission" or "no team".
- **An error is caught and then dropped** — SHELL-12, ONB-11, LOGIN-10, SET-25. Either
  nothing is said, or the wrong thing is.
- **Placeholder geometry doesn't match the content** — SET-22, PICK-2, LOAD-1. Every
  one is a visible jump when data lands.
- **A pattern was established and then not applied everywhere** — SHELL-8 (one
  switcher unwrapped), SET-20 (two panels use `RetryError`, three don't), SET-24
  (per-row pending done elsewhere), MFA-2 and LOAD-3 (two screens, two conventions).
  These are the cheapest to fix and the most likely to recur, because nothing enforces
  them. Several would be well served by a lint rule or a structure test rather than a
  one-time fix.
