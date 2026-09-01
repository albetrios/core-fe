# Medium-Severity State & Flicker Issues — core-fe

The 34 medium-severity findings from the login-to-settings audit. Same format as
`HIGH-SEVERITY-ISSUES.md`: what goes wrong for the user, why it happens in the code,
and the fix.

**Audit date:** 31 August 2026 · **Scope:** `core-fe`, every route from `/login`
through the settings modal.

> **Count correction.** The summary in the published audit said 33 medium. Recounting
> row by row while writing this up gives **34** — the settings group has 12 medium
> items, not 11. The high (23) and low (27) counts are unchanged.

---

## What "medium" means here

These do not lose data and do not strand the user, which is what separates them from
the high list. They are the ones that make the app feel unreliable: a control that
gives no feedback, a panel that flashes the wrong thing before settling, a failure
that produces a message too vague to act on. Individually each is survivable.
Together they are most of the reason the UI feels flaky.

Ordered by area. Each entry has **What happens**, **Why**, **Fix**.

---

## Quick index

| ID      | Area             | One-line summary                                         |
| ------- | ---------------- | -------------------------------------------------------- |
| LOGIN-6 | `/login`         | Verify panel and header disagree for one frame           |
| LOGIN-7 | `/login`         | Passkey prompts, then blames the user for cancelling     |
| CB-2    | `/callback`      | Stale callback yanks you off the page you opened         |
| ONB-3   | `/onboarding`    | Step dots show none current; first Back does nothing     |
| ONB-4   | `/onboarding`    | Previous user's details paint for a frame                |
| ONB-5   | `/onboarding`    | Finish fails with a message that names no cause          |
| ONB-6   | `/onboarding`    | Bad workspace slug only fails at the very end            |
| ONB-7   | `/onboarding`    | New org missing from lists for five minutes              |
| ONB-8   | `/onboarding`    | Concurrent finish can create two organizations           |
| INV-2   | `/accept-invite` | Redirect timer fires after you navigate away             |
| INV-3   | `/accept-invite` | A failed accept has no retry, and the link is spent      |
| INV-4   | `/accept-invite` | "Joining…" card flashes before the login redirect        |
| PICK-1  | `/organization`  | "Try again" looks dead and can be spammed                |
| SHELL-5 | App shell        | Appearance → Shuffle tears down the whole shell          |
| SHELL-6 | App shell        | Every navigation force-remounts the routed subtree       |
| SHELL-7 | App shell        | Closing ⌘K drops keyboard focus to the body              |
| DASH-1  | Dashboard        | Members roster skeleton can never resolve                |
| SET-8   | Settings         | Disable-2FA dialog closes before anything happens        |
| SET-9   | Settings         | Step-up picks the wrong factor and emails you            |
| SET-10  | Settings         | Role dialog self-checks boxes and wipes edits            |
| SET-11  | Settings         | Roles fetch fails → "go create a role first"             |
| SET-12  | Settings         | Remove dialog closes early; role changes can double-fire |
| SET-13  | Settings         | Plan selection: unhandled rejection, all buttons freeze  |
| SET-14  | Settings         | Cancelling a subscription gives no confirmation          |
| SET-15  | Settings         | Settings nav rearranges itself after context loads       |
| SET-16  | Settings         | Session countdown double-speeds and leaks an interval    |
| SET-17  | Settings         | Payment-method failure is completely silent              |
| SET-18  | Settings         | Profile form can stay empty at 0% completeness           |
| SET-19  | Settings         | Every keystroke in a settings list flashes skeletons     |
| X-3     | Shared           | Query failures are silent unless a component opts in     |
| X-4     | Shared           | The documented CRUD hooks will inherit silent failures   |
| X-5     | Shared           | `QueryBoundary` shows an unresolvable skeleton           |
| X-6     | Shared           | Cold boot is blank for up to three seconds               |
| X-7     | Shared           | Refresh-timer listener survives logout                   |

---

## 1 · Login — `/login`

### LOGIN-6 — Verify panel and header disagree for one frame

**What happens.** After requesting a sign-in code, there is a visible frame where the
six-box code input is already rendered _underneath_ the still-visible "Welcome"
header and the Google/GitHub/passkey buttons. Then the page collapses to the verify
layout. The user sees the screen jump.

**Why.** `AuthEmailPanel.tsx:158–160` reports its step change to the parent from
inside an effect:

```tsx
useEffect(() => {
  onStepChange?.(step, step === 'verify' ? submittedEmail || undefined : undefined);
}, [step, submittedEmail, onStepChange]);
```

The parent's `emailFlowStep` (`AuthForm.tsx:92`) drives the header variant
(`:247–250`), whether the OAuth picker renders (`:259–291`), the divider (`:293`) and
the container gap (`:243`). The child re-renders in the verify state one commit
before the parent hides the picker.

**Fix.** Give the step one owner. Lift `step` and `submittedEmail` into `AuthForm` so
parent and child commit together, or call `onStepChange` synchronously inside
`sendCode` / `changeEmail` rather than reporting it from an effect. This is the same
root cause as LOGIN-1 in the high list: state that is known at the moment of the
action is being announced a render too late.

---

### LOGIN-7 — Passkey prompts, then blames the user for cancelling

**What happens.** The user clicks "Continue with a passkey", completes the biometric
or OS prompt, and is then told the passkey was **cancelled**. They did nothing wrong,
and the message says they did.

**Why.** `passkey-sign-in.ts:38–42` throws unconditionally _after_
`navigator.credentials.get()` has already prompted:

```ts
throw new AppError(
  'Passkey sign-in requires a configured backend.',
  501,
  FRONTEND_ERROR_CODES.AUTH_PASSKEY_CANCELLED,
);
```

The error code maps to the "passkey cancelled" copy, and the `navigate({ to: '/' })`
at `AuthForm.tsx:175` is unreachable. The backend WebAuthn login endpoints are not
wired yet, but the button is fully advertised.

**Fix.** Don't offer a method that cannot work. Gate the passkey button behind a
capability check on `/auth/webauthn/login/*` so it is hidden until the backend lands.
If you want to keep it visible, map the 501 to an honest message — "passkey sign-in
isn't available yet" — so the failure is attributed to the product, not the user.

---

## 2 · OAuth callback — `/callback/$provider`

### CB-2 — Stale callback yanks you off the page you opened

**What happens.** If the user navigates away from the callback screen quickly — a
back gesture, say — the callback's async work still finishes and redirects them,
pulling them off whatever page they just opened.

**Why.** `CallbackPage.tsx:17–34` runs `void (async () => { … })()` with no
cancellation flag and no cleanup. The `started` ref at `:15` correctly prevents a
_duplicate request_ under StrictMode, but it does nothing about a _stale effect_:
`captureAnalyticsEvent` and `navigate` both run after the awaited `silentRefresh()`
regardless of whether the component is still mounted.

**Fix.** Standard cancellation:

```ts
let cancelled = false;
void (async () => {
  … await silentRefresh();
  if (cancelled) return;
  void navigate({ … });
})();
return () => { cancelled = true; };
```

---

## 3 · Onboarding — `/onboarding`

### ONB-3 — Step dots show none current; first Back does nothing

**What happens.** The step indicator marks _every_ dot as complete and highlights
none as current, so the user cannot tell where they are. `aria-current="step"`
disappears entirely, so screen readers lose the position too. Clicking Back the first
time appears to do nothing.

**Why.** `OnboardingPage.tsx:350` clamps the index for rendering the step
(`stepAtIndex(stepIndex, effectiveSteps)`) but `:484` passes the **raw** value to the
indicator:

```tsx
<StepIndicator current={stepIndex} steps={effectiveSteps} />
```

`stepIndex` is persisted in localStorage and never re-clamped when `effectiveSteps`
shrinks — which happens when the deployment mode changes or a team org appears
between sessions. With `stepIndex = 5` and five steps, `stepAtIndex` renders `done`
while the indicator marks all dots done. Back then computes `Math.max(5-1, 0) = 4`,
which still clamps to `done`, so the first click is a no-op.

**Fix.** Clamp once and use it everywhere. The helper already exists at
`onboarding-flow.ts:51`:

```ts
const clampedIndex = clampStepIndex(stepIndex, effectiveSteps);
```

Drive `StepIndicator`, Back and Continue off `clampedIndex`, not the persisted value.

---

### ONB-4 — Previous user's details paint for a frame

**What happens.** Signing in as a second user on the same browser shows the _previous_
user's first name and workspace name in the wizard for a frame before they are wiped,
followed by a spurious "back" step animation as the index drops to zero.

**Why.** `OnboardingPage.tsx:366–369` claims the persisted store for the current user
in a passive effect:

```ts
const sessionUserId = meContext?.user.id ?? null;
useEffect(() => {
  if (sessionUserId) claimForUser(sessionUserId);
}, [sessionUserId, claimForUser]);
```

`claimForUser` wipes the store when `forUserId` differs
(`useOnboardingStore.ts:124–136`), but because this runs after commit, render 1 has
already put the previous user's data in the DOM. The existing test
(`OnboardingPage.test.tsx:188`) asserts the wipe happens, not that it happens before
paint.

**Fix.** Claim during render, not after it — via a `useState` initialiser, or in
`requireOnboardingWorkspace`'s `beforeLoad` where `me/context` is already awaited.
Foreign user state should never reach the DOM.

---

### ONB-5 — Finish fails with a message that names no cause

**What happens.** Finishing onboarding fails and the user gets a single generic toast
on the Done step. It names no reason and no field, the page looks unchanged, the
button re-enables, and retrying stacks duplicate toasts. The most common real cause
is the workspace slug set two steps earlier, which the message never mentions.

**Why.** `OnboardingPage.tsx:467–471` discards the error entirely:

```ts
} catch {
  notify.error(i18n.t(ONBOARDING_KEYS.toast.finishError, { ns: ONBOARDING_NS }));
} finally { setSubmitting(false); }
```

No `mapFrontendError`, no `reportError`, no persistent UI, no toast `id`. The
accept-invite page does use `mapFrontendError` (`AcceptInvitePage.tsx:111`), so the
pattern exists — it just isn't used here.

**Fix.** Capture the error into state and render it where the user can act on it:

```ts
} catch (err) {
  reportError(err);
  setFinishError(mapFrontendError(err));
  notify.error(mapFrontendError(err), { id: 'onboarding-finish' });
}
```

Render `finishError` inline with `role="alert"` next to the Finish button, and clear
it at the top of the next `finish()`. Pair with ONB-6 so slug problems are caught
before the user ever reaches this step.

---

### ONB-6 — Bad workspace slug only fails at the very end

**What happens.** The workspace step accepts an uppercase or space-containing slug
with a live URL preview and no complaint. Continue works. Then Finish throws a
`ZodError` deep inside `createOrganization`, surfacing as ONB-5's unhelpful toast —
two steps away from the field that caused it.

**Why.** `OnboardingPage.tsx:392–394` validates only the name:

```ts
const canProceed =
  (step !== 'workspace' || data.organizationName.trim().length > 0) &&
  (step !== 'profile' || data.firstName.trim().length > 0);
```

`WorkspaceStep.tsx:50–57` renders the slug as free text. The real constraint,
`/^[a-z0-9-]{0,50}$/`, lives in `createOrganizationSchema`
(`my-organizations.ts:20–24`) and is not applied until submission.

**Fix.** Validate at the field, using the schema that already exists:

```ts
const slugError = createOrganizationSchema.shape.slug.safeParse(data.organizationSlug);
```

Show it inline with `aria-invalid` and include it in `canProceed`. A 409 on a taken
slug should get its own message too, since it is indistinguishable from a format
error today.

---

### ONB-7 — New org missing from lists for five minutes

**What happens.** A user finishes onboarding, then opens `/organization` or Settings →
Organization within five minutes and the workspace they just created **is not
listed**.

**Why.** The finish path calls `hydrateSessionContext()` and `switchToOrganization()`
but never invalidates the `['organizations']` query
(`OnboardingPage.tsx:435–440`). With `staleTime` at five minutes
(`constants.ts:44`), the picker (`OrganizationPickerPage.tsx:26`) and the org settings
panel (`OrganizationGeneralPanel.tsx:163`) serve a cached list from before the org
existed. `CreateOrganizationDialog.tsx:86` does this correctly, so the wizard is the
outlier.

**Fix.** One line alongside the hydrate call:

```ts
await queryClient.invalidateQueries({ queryKey: ['organizations'] });
```

---

### ONB-8 — Concurrent finish can create two organizations

**What happens.** Two entries into `finish()` create two organizations, because each
sees `createdOrganizationId` as `null` and issues its own `createOrganization` POST
with a distinct idempotency key.

**Why.** The only guard is React state — `disabled={submitting}`
(`OnboardingPage.tsx:511–516`) — with no in-flight ref. And
`resolveOrganizationForFinish` (`:131–155`) reads `createdOrganizationId` from the
render closure rather than the live store, so a second entry reads a stale `null`.

In fairness: React 19 flushes discrete click updates synchronously, so two ordinary
human clicks are very unlikely to both get in. The store field
(`useOnboardingStore.ts:47–51`) exists precisely to prevent duplicates, but it only
protects _sequential_ retries. Any non-discrete trigger — scripted, synthetic, or a
future programmatic call — defeats both guards.

**Fix.** Add a real in-flight guard and read the store live:

```ts
const inFlight = useRef(false);
async function finish() {
  if (inFlight.current) return;
  inFlight.current = true;
  try { … } finally { inFlight.current = false; }
}
```

Inside `resolveOrganizationForFinish`, read
`useOnboardingStore.getState().createdOrganizationId` rather than the closure value.

---

## 4 · Accept invite — `/accept-invite/$invitationId`

### INV-2 — Redirect timer fires after you navigate away

**What happens.** If the user leaves the invite screen inside the 900 ms redirect
window, the timer still fires and pulls them off whatever route they went to.

**Why.** `AcceptInvitePage.tsx:80–90` and `:93–96` both call `setTimeout` and the
effect returns no cleanup. The same effect also calls `setStatus` / `setError` after
long awaits with no ignore flag.

**Fix.** Hoist the timer id and clear it on cleanup; guard the state setters with a
cancelled flag, as in CB-2.

---

### INV-3 — A failed accept has no retry, and the link is spent

**What happens.** A transient 500 on invite acceptance leaves an error card whose only
action is "back to login". Reloading does not help either: `useConsumedSearchToken`
has already scrubbed `?token=` from the URL, so a refresh lands on the invalid-link
state. The user has to find the original email again.

**Why.** `startedRef` (`AcceptInvitePage.tsx:41`) correctly prevents a StrictMode
double-POST, but it is never reset, so there is no path back into the accepting
state. The error card at `:153–161` offers only a `<Link to="/login">`.

**Fix.** Add a retry that resets the guard and re-enters the flow, using the token
already captured in component state:

```tsx
<Button
  onClick={() => {
    startedRef.current = false;
    setError(null);
    setStatus('accepting');
  }}
>
  {t(keys.tryAgain)}
</Button>
```

---

### INV-4 — "Joining…" card flashes before the login redirect

**What happens.** A signed-out invitee — the _common_ case, as the code's own comment
at `:55–59` notes — sees the "Joining…" card and spinner flash before being bounced
to the login screen.

**Why.** `AcceptInvitePage.tsx:60–69` checks `getAccessToken()`, a synchronous
in-memory read, but does so inside a passive effect. The card at `:140–145` is
committed and painted first.

**Fix.** Move the check into the route's `beforeLoad` (`routeTree.tsx:237–239`, which
already runs a synchronous id check) and `throw redirect(...)` there. A guard that
redirects before render costs zero frames; the same check in an effect always costs
one.

---

## 5 · Organization picker — `/organization`

### PICK-1 — "Try again" looks dead and can be spammed

**What happens.** When the organization list fails to load, clicking "Try again"
produces no visible change for the whole round trip — the error card sits there
unchanged. So users click it repeatedly, firing N parallel refetches.

**Why.** `OrganizationPickerPage.tsx:61–68` renders the button with no pending state.
During a retry, TanStack Query v5 keeps `status: 'error'` while `fetchStatus` is
`'fetching'`, so `isError` stays true and `isLoading` stays false. Nothing in the
component's render output changes.

**Fix.** Read `isFetching` and reflect it:

```tsx
<Button disabled={isFetching} onClick={() => void refetch()}>
  {isFetching ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
  {t(keys.tryAgain)}
</Button>
```

---

## 6 · App shell

### SHELL-5 — Appearance → Shuffle tears down the whole shell

**What happens.** One click on Shuffle in the Appearance panel unmounts the entire app
shell. The first time each variant is rolled its chunk is cold, so the bare "Loading"
fallback flashes over the whole viewport. The dashboard's chart range, calendar
selection and carousel position all reset.

**Why.** `AppearanceDialog.tsx:58–61` calls `shuffleTheme()`, and `SHUFFLE_TEMP` has
`appLayout: true` and `dashboard: true` (`presets.ts:836–849`), so
`useThemeStore.ts:199–213` re-rolls `appVariant` and `dashboardVariant` — each a
different lazy shell chunk. The panel is production-reachable via the always-mounted
`FloatingEdgeControls`.

**Fix.** A cosmetic shuffle should not remount the application. Either drop
`appLayout` from the shuffle axes, or preload the target chunk and commit the swap
inside `startTransition` so the current shell stays mounted until the new one is
ready. Same underlying problem as SHELL-1 in the high list.

---

### SHELL-6 — Every navigation force-remounts the routed subtree

**What happens.** Navigating between organizations discards all page state and replays
the fade-and-rise animation across the entire content region. Combined with X-2, the
widgets flash empty on the way through.

**Why.** `PageTransition.tsx:17` keys the wrapper on the pathname:

```tsx
<div key={pathname} className="text-foreground animate-fade-in-up">
```

A key change is a full unmount and remount, not a transition. It wraps `<Outlet/>` at
`AppLayout.shared.tsx:404–406`, so it applies to every in-app navigation.

**Fix.** Re-trigger the animation without changing identity — set a `data-route`
attribute and restart the CSS animation on change, or use `useTransition`. Remounting
is an expensive way to replay a 200 ms fade.

---

### SHELL-7 — Closing ⌘K drops keyboard focus to the body

**What happens.** After closing the command palette, focus lands on `<body>` instead
of returning to whatever the user was on. Keyboard and screen-reader users lose their
place.

**Why.** `CommandPalette.tsx:75–82` stores and restores focus in the effect _body_:

```tsx
useEffect(() => {
  if (open) { previousFocusRef.current = document.activeElement as HTMLElement; }
  else if (previousFocusRef.current) { previousFocusRef.current.focus(); … }
}, [open]);
```

The parent gate at `CommandPaletteLazy.tsx:32` (`if (!open) return null`) unmounts the
component the instant `open` flips false, so the `else` branch never runs. The
`if (!open) return null` at `:119` is dead code for the same reason.

**Fix.** Restore focus in the effect's cleanup, which runs on unmount:

```tsx
useEffect(() => {
  const previous = document.activeElement as HTMLElement | null;
  return () => previous?.focus?.();
}, []);
```

---

## 7 · Dashboard

### DASH-1 — Members roster skeleton can never resolve

**What happens.** The dashboard members roster can show three shimmering skeleton rows
that never resolve — no data, no empty state, no error, indefinitely.

**Why.** `MembersTable.tsx:63, 89` gates the skeleton on `isPending`, and
`useMembers.ts:31–37` sets `enabled: Boolean(orgId)`. In TanStack Query v5 a
**disabled** query reports `status: 'pending'` with `fetchStatus: 'idle'` — so while
`organizationId` is null, `isPending` is `true` forever and the skeleton is
permanent. `useCursorList.ts:48` passes `query.isPending` straight through, so every
consumer inherits it.

**Fix.** Fix it once in `useCursorList` by distinguishing "disabled" from "loading",
then give the idle case its own state:

```ts
isPending: query.isPending && query.fetchStatus !== 'idle',
isIdle: query.fetchStatus === 'idle' && query.isPending,
```

Render an explicit "no workspace selected" state when `isIdle`. See X-5 — the same
confusion is baked into `QueryBoundary`.

---

## 8 · Settings — `#settings/…`

### SET-8 — Disable-2FA dialog closes before anything happens

**What happens.** The user clicks "Disable" on two-factor auth. The confirmation
dialog vanishes instantly with no busy state and no feedback. Seconds later the
step-up prompt — or an error toast — appears out of context, with nothing on screen
explaining why.

**Why.** `AccountSecurityPanel.tsx:229–233` passes a callback that returns `void`:

```ts
onConfirm={() => { guard(() => disable.mutateAsync(), { allowEmailCode: false }); }}
```

`guard` (`useStepUpGuard.tsx:33–44`) returns nothing, so `ConfirmDialog`'s
`await onConfirm()` (`ConfirmDialog.tsx:45–55`) resolves on the next microtask,
`onOpenChange(false)` fires, and the dialog's own `busy` state never renders.

**Fix.** Have `guard` return the promise so the dialog can await the real work:

```ts
onConfirm={() => guard(() => disable.mutateAsync(), { allowEmailCode: false })}
```

Expose an `isGuarding` flag from `useStepUpGuard` for callers that need it.

---

### SET-9 — Step-up picks the wrong factor and emails you

**What happens.** For an account with MFA enabled but a cold status cache, the step-up
dialog decides the factor is _email_, sends a verification email the user did not
need, and then swaps the field to the TOTP input when the status lands.

**Why.** `StepUpDialog.tsx:162` defaults `mfaEnabled` to `false` while
`useMfaStatus()` is pending. The auto-send effect at `:196` gates on
`methods.isPending` but **not** on the MFA query:

```ts
if (factor === 'email' && !sentForOpen.current && !methods.isPending) { … sendEmailCode(); }
```

So the factor resolves to `email` before the app knows the account has TOTP.

**Fix.** Wait for both queries before choosing a factor:

```ts
const mfa = useMfaStatus();
if (mfa.isPending || methods.isPending) return <StepUpSkeleton />;
```

Include `mfa.isPending` in the auto-send gate. Sending an email is a side effect —
it should never be triggered by a default value standing in for unknown state.

---

### SET-10 — Role dialog self-checks boxes and wipes edits

**What happens.** Opening a role for editing shows every permission unchecked, then
the boxes visibly tick themselves as data arrives. Worse: any other role mutation
elsewhere in the panel refetches this query and **wipes whatever the user has
checked** mid-edit.

**Why.** `CreateRoleDialog.tsx:104–112` resets the form on every `data` identity
change:

```ts
useEffect(() => {
  if (role && rolePermissions.data) { reset({ …, permissions: rolePermissions.data }); }
}, [role, rolePermissions.data, reset]);
```

The list endpoint omits permissions (per the comment at `:84–85`), so the dialog
genuinely opens empty. And `useRolePermissions`' key —
`[...orgQueryKeys.roles(orgId), 'permissions', roleId]` (`useRoles.ts:43`) — is a
**descendant** of the prefix that `useUpdateRole` / `useDeleteRole` invalidate, so
unrelated role mutations retrigger this effect.

**Fix.** Don't render the form until the data it depends on is present, and reset once:

```tsx
if (rolePermissions.isPending) return <RoleFormSkeleton />;
```

Guard the reset on a `hasResetRef` or the `isSuccess` transition so a background
refetch cannot clobber in-progress edits.

---

### SET-11 — Roles fetch fails → "go create a role first"

**What happens.** When the roles request fails, the invite dialog tells the user there
are no roles and they should create one — for an organization that already has roles.
Following that advice creates a duplicate.

**Why.** `InviteMemberDialog.tsx:160–175` has only two branches. The `else` is reached
whenever `hasRoles` is false, and `roles.isError` yields `rows: []`, so an error and
a genuinely empty list are indistinguishable.

A related issue in the same file at `:77–80`: the `setValue('roleId', …)` effect is
keyed on `invitableRoles[0]?.id`, so if the first role's id changes mid-session it
silently overwrites a role the user already picked.

**Fix.** Add the error branch:

```tsx
} else if (roles.isError) {
  body = <RetryError message={t(keys.rolesLoadFailed)} onRetry={roles.refetch} />;
}
```

And only default the role selection when the field is still untouched.

---

### SET-12 — Remove dialog closes early; role changes can double-fire

**What happens.** The remove-member confirmation closes immediately on click, before
the request completes, so a failure surfaces with no dialog to attach it to. And the
role/status menu has no pending state, so it can be clicked repeatedly, firing
duplicate role changes.

**Why.** `MembersTable.tsx:163–166` has no `e.preventDefault()`, so Radix closes the
dialog on click:

```tsx
<AlertDialogAction onClick={() => removeMember.mutate(member.id)}>
```

The correct pattern is used elsewhere in the codebase — `AccountPanel.tsx:179–186`
and `ProfileForm.tsx:201–208` both call `preventDefault` and close in `onSuccess`.
Separately `:113–138` calls `updateRole.mutate` / `updateStatus.mutate` with no
disabled state.

**Fix.** Follow the existing pattern:

```tsx
<AlertDialogAction
  disabled={removeMember.isPending}
  onClick={(e) => { e.preventDefault(); removeMember.mutate(member.id, { onSuccess: close }); }}>
```

Disable the role radio group while `updateRole.isPending`.

---

### SET-13 — Plan selection: unhandled rejection, all buttons freeze

**What happens.** Selecting a billing plan disables **every** plan button with no
per-button spinner, so the user cannot tell which one they clicked. If the follow-up
payment-setup call fails, they are left on an `incomplete` subscription with no
payment form and no message at all.

**Why.** `AccountBillingPanel.tsx:139–147` uses `mutateAsync`, which rethrows, and
`:254` discards it with `void` — producing an unhandled promise rejection and Sentry
noise:

```ts
onClick={() => void handlePlanSelect(plan.id)}
```

The `getSubscriptionPaymentSetup` call at `:142` has no error handling of its own.
`disabled={selectPlan.isPending}` is applied to all plan buttons.

**Fix.** Three changes: `.catch(() => {})` on the void call, since `useAppMutation`
already toasts; wrap the payment-setup call in its own try/catch with a real message;
and track the selected plan id so only the clicked button shows a spinner.

---

### SET-14 — Cancelling a subscription gives no confirmation

**What happens.** The user cancels their subscription — a consequential, hard-to-undo
action — and receives no confirmation whatsoever. Resuming is equally silent.

**Why.** `useCancelSubscription` and `useResumeSubscription`
(`useSubscription.ts:61–75`) define no `successMessage`, unlike essentially every
other mutation in the codebase. And `BillingCancellationSection.tsx:90–92` closes the
dialog on click with no `preventDefault` and no pending state.

**Fix.** Add `successMessage` to both hooks, and apply the SET-12 dialog pattern. Of
all the mutations in the app, subscription changes are the ones most deserving of an
explicit confirmation.

---

### SET-15 — Settings nav rearranges itself after context loads

**What happens.** On a personal organization, the entire Organization group is visible
in the settings rail for a beat and then disappears. A deep link to
`#settings/organization/members` renders the members panel first, then swaps to a
fallback section, and the hash is rewritten underneath the user.

**Why.** `SettingsModal.tsx:101` reads
`useMeContext().data?.activeOrganization?.type`, which is `undefined` while the query
is in flight. Both `visibleSettingsNavGroups` (`settings-nav-visibility.ts:30–31`,
`!ctx.orgType || …`) and `isSettingsSectionAvailable` (`settings-resolve.ts:43–44`)
deliberately permit everything in that state, and the `useLayoutEffect` at `:139–148`
then rewrites the hash once the truth arrives.

**Fix.** Render a skeleton rail while `useMeContext().isPending` rather than
defaulting to "show everything". Permissive-while-unknown is the right instinct for
avoiding a flash of _missing_ nav, but here it produces a flash of _wrong_ nav plus a
URL rewrite, which is worse.

---

### SET-16 — Session countdown double-speeds and leaks an interval

**What happens.** The session-timeout countdown can tick down at twice the correct
rate, and an interval leaks for the lifetime of the tab. In a throttled background tab
the number shown does not match when logout actually fires, and reaching zero does
nothing on its own.

**Why.** `SessionTimeoutDialog.tsx:38–49` never clears a prior interval:

```ts
const startCountdown = useCallback(() => {
  setCountdown(GRACE_SECONDS);
  intervalRef.current = setInterval(…);
}, []);
```

A second `onWarn` without an intervening `onActive` orphans the first interval,
because the ref only holds the most recent one. Separately, the countdown is a
free-running decrementing counter rather than something derived from the real logout
deadline.

**Fix.** Call `stopCountdown()` at the top of `startCountdown`, and derive the
displayed value from a deadline timestamp:

```ts
const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
```

That stays correct through tab throttling, which a decrementing counter cannot.

---

### SET-17 — Payment-method failure is completely silent

**What happens.** If adding a payment method fails, the button simply re-enables and
the user sees nothing at all. Closing the modal mid-request sets state on an unmounted
component.

**Why.** `BillingPaymentMethods.tsx:92–102` has `try { … } finally { setIsAdding(false) }`
with **no catch**, and it is invoked as `void handleAddPaymentMethod()` at `:163`, so
the rejection is unhandled. The setup effects here and at
`AccountBillingPanel.tsx:117–137` call async APIs and `setState` in the continuation
with no cancellation; the mount-only effect at `:94–115` also double-fires `navigate`
and `invalidateQueries` under StrictMode.

**Fix.** Add a catch with `notify.error(mapApiError(e))`, and an ignore flag or
`AbortController` in the effects. A `finally` that resets a loading flag without a
`catch` to explain the failure is the worst of both worlds — it looks handled and
says nothing.

---

### SET-18 — Profile form can stay empty at 0% completeness

**What happens.** The profile form can render blank with a completeness meter reading
0%, even for a user who has a name and job title set, if the user object was not
loaded at the moment the panel mounted.

**Why.** `AccountProfilePanel.tsx:26–29` seeds local state once:

```ts
const [values, setValues] = useState<ProfileInput>({
  name: user?.name ?? '',
  jobTitle: user?.jobTitle ?? '',
});
```

That is fed into `ProfileForm`'s `defaultValues` (`ProfileForm.tsx:71`), which
react-hook-form reads only on first render. If `user` was null or stale then — auth
store still hydrating, or a later `me/context` refresh — nothing re-syncs.

**Fix.** Either key the form on identity so it remounts with fresh defaults
(`<ProfileForm key={user?.id} …>`), or call `reset(toDefaults(user))` when the user
object changes. `defaultValues` is a first-render-only prop; treating it as reactive
is a recurring react-hook-form trap.

---

### SET-19 — Every keystroke in a settings list flashes skeletons

**What happens.** Typing in the members, roles or API-keys search replaces the rows
with skeletons on each debounced keystroke, and the container height jumps. Changing
the sort does the same.

**Why.** Search and sort are part of the query key, so each change is a cache miss and
`isPending` flips true. Consumers gate the skeleton directly on it:
`OrganizationMembersPanel.tsx:235`, `OrganizationRolesPanel.tsx:145`,
`OrganizationIntegrationsPanel.tsx:82–88`.

**Fix.** This is X-2 from the high list — fix it centrally with
`placeholderData: keepPreviousData` in `useCursorList`, then dim on `isFetching`
instead of swapping in a skeleton. All three panels are fixed by that one change.

---

## 9 · Cross-cutting

### X-3 — Query failures are silent unless a component opts in

**What happens.** A failed fetch produces nothing — no toast, no banner — unless the
individual component happens to render an `isError` branch. Several panels therefore
present a failure as "empty".

**Why.** `queryClient.ts:38–42` toasts only when a query sets
`meta.notifyOnError === true`. Across **19 query call sites, exactly zero set it.**
Error visibility is opt-in, and nothing has opted in.

**Fix.** Invert the default in the shared query hooks so silence must be chosen:

```ts
useQuery({ …, meta: { notifyOnError: true, ...meta } });
```

Queries that render their own inline error can opt out. This is the systemic cause
behind SET-3, SET-4 and X-1 in the high list.

---

### X-4 — The documented CRUD hooks will inherit silent failures

**What happens.** Nothing today — these hooks have no consumers. But `CLAUDE.md`
points new resource pages at them, so the first page built on them gets silent
failures and a submit button that spins long after the write finished.

**Why.** `useCreate.ts:11–16`, `useUpdate.ts:12–18` and `useDelete.ts:10–15` are raw
`useMutation` calls with no `onError`, no `meta.notifyOnError`, no success toast and
no rollback. They also `await queryClient.invalidateQueries(...)` inside `onSuccess`,
which keeps `isPending` true until every refetch settles — and with
`retry: failureCount < 2` a failing refetch can hold the button for many seconds.

**Fix.** Rebuild all three on `useAppMutation`, which already handles rollback,
invalidation and toasts, and stop awaiting the invalidation inside `onSuccess`. Fix
these before anyone builds on them, not after.

---

### X-5 — `QueryBoundary` shows an unresolvable skeleton

**What happens.** A disabled query renders a skeleton that never resolves. Two call
sites already work around it with manual early returns, which makes it a trap for the
next person.

**Why.** `QueryBoundary.tsx:42`:

```tsx
if (query.isPending) return <>{loading ?? <DefaultSkeleton />}</>;
```

In TanStack Query v5 a disabled query is permanently `pending`. `useOne`,
`useMembers`, `useRoles` and `useApiKeys` are all `enabled`-gated — and `useOne`'s own
docstring invites callers to pass an undefined id, which pairs with this boundary to
produce a guaranteed infinite skeleton. The existing workarounds are at
`BillingInvoicesTable.tsx:95–98` and `BillingPaymentMethods.tsx:111–116`.

**Fix.** Distinguish idle from loading in the boundary itself:

```tsx
if (query.fetchStatus === 'idle' && query.isPending) return <>{idle ?? null}</>;
if (query.isPending) return <>{loading ?? <DefaultSkeleton />}</>;
```

---

### X-6 — Cold boot is blank for up to three seconds

**What happens.** On a cold visit to `/`, `/login`, `/onboarding` or `/organization`,
the page is empty except for a 2 px progress bar for as long as the guard chain takes
— up to three seconds before any spinner appears.

**Why.** `routeTree.tsx:418` sets `defaultPendingMs: 3000`. That is a deliberate,
well-reasoned default for _in-app_ navigation, where the current screen stays up and
the progress bar carries the feedback. But on a cold load there is no previous screen:
the `/` resolver renders `component: () => null`, and `main.tsx:128` dismisses the
boot splash after paint regardless of whether the route has resolved.

**Fix.** Keep the 3 s default for in-app navigation and override it on the
network-gated entry routes:

```ts
pendingMs: 0,
pendingComponent: () => <FullPageSpinner />,
```

Alternatively, hold the boot splash until the router's first match resolves, which
also removes the splash-to-blank transition.

---

### X-7 — Refresh-timer listener survives logout

**What happens.** After logout, focusing the tab fires a token refresh for a dead
session. Since core-be rotates refresh sessions with reuse detection, this is a
session-killing path — and the listeners accumulate across login/logout cycles.

**Why.** `refresh-timer.ts:43–49` adds a `visibilitychange` listener:

```ts
const onVisible = () => {
  document.removeEventListener('visibilitychange', onVisible);
  void doProactiveRefresh();
};
document.addEventListener('visibilitychange', onVisible);
```

It removes itself only when it _fires_. `cancelTokenRefresh()` (`:76–81`) clears
`refreshTimerId` and nothing else, so a cancelled refresh leaves the listener armed.

**Fix.** Keep an `AbortController` beside the timer id and abort it on cancel:

```ts
document.addEventListener('visibilitychange', onVisible, { signal: controller.signal });
// cancelTokenRefresh():
controller.abort();
```

---

## Suggested order

1. **X-3 and X-5** — two shared files. X-3 makes every silent failure visible; X-5
   removes the infinite-skeleton trap and closes DASH-1.
2. **SET-19 via X-2** (in the high list) — one line in `useCursorList` fixes the
   flicker in three panels.
3. **The dialog-lifecycle cluster — SET-8, SET-12, SET-14.** All three are the same
   fix: `preventDefault`, await the real promise, close in `onSuccess`. Do them
   together and the pattern is consistent afterwards.
4. **The silent-failure cluster — SET-13, SET-17, SET-11, PICK-1.** Each is a missing
   catch or a missing error branch.
5. **Onboarding — ONB-3 through ONB-8.** Mostly independent and small; ONB-6 and ONB-5
   are best done as one change, since validating the slug early is what makes the
   finish error rare enough to matter less.
6. **X-7** on its own — small, but it touches session integrity, so it deserves its
   own commit and test.

---

## Patterns behind these

The same five shapes from the high list recur here, which is the argument for fixing
them as patterns rather than as 34 separate tickets:

- **State known at action time is announced from an effect** — LOGIN-6, ONB-4, INV-4.
  One frame of the wrong UI, every time.
- **A default stands in for "unknown"** — SET-9, SET-15, DASH-1, X-5. `= false`,
  `= []` and `pending` all make "still loading" indistinguishable from a real answer.
- **`defaultValues` and one-shot state treated as reactive** — SET-18, SET-10. Data
  arriving after mount either never lands or lands on top of the user's edits.
- **A dialog closes before its mutation settles** — SET-8, SET-12, SET-14. The result
  arrives with nothing on screen to attach it to.
- **A `finally` without a `catch`** — SET-13, SET-17. The loading flag resets, so it
  looks handled, and the user is told nothing.
