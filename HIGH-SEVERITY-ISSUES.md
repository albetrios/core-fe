# High-Severity State & Flicker Issues — core-fe

All 23 high-severity findings from the login-to-settings audit. For each one: what
actually goes wrong from the user's point of view, why it happens in the code, and
the fix I'd recommend.

**Audit date:** 31 August 2026 · **Scope:** `core-fe` — every route from `/login`
through to the settings modal · **Severity counts across the full audit:** 23 high,
33 medium, 27 low.

---

## How to read this

Each issue has three parts:

- **What happens** — the user-visible symptom, in plain terms.
- **Why** — the mechanism in the code, with file and line.
- **Fix** — what to change, and why that's the right shape of fix.

Issues are grouped by where they live. **Start with the cross-cutting section at the
end** — those four fixes touch shared primitives and close or soften a third of
everything else.

### Two corrections to earlier notes

1. The OAuth callback route is **`/callback/$provider`** (e.g. `/callback/google`),
   not `/callback`. I confirmed this in `routeTree.tsx:213–223` while reproducing —
   a bare `/callback` correctly 404s. `docs/reference/routes-and-ui.md` still lists
   `/callback` as "one URL for every OAuth provider", so that table is stale and
   worth correcting.
2. Separately, the dev server on `:5173` had been running Vite 8.2.1 against a
   `node_modules` holding 8.2.2, so it served a client path that no longer existed
   and React never mounted. That was a stale process, not an app bug — I restarted
   it. Worth knowing if it happens again after a dependency bump.

---

## Quick index

| ID      | Area                  | One-line summary                                        |
| ------- | --------------------- | ------------------------------------------------------- |
| LOGIN-1 | `/login`              | The login form paints for a frame, then vanishes        |
| LOGIN-2 | `/login`              | The auto-Google screen hides its own cancel button      |
| LOGIN-3 | `/login`              | Login can strand permanently on the auto-Google spinner |
| LOGIN-4 | `/login`              | Verify button spins while nothing is loading            |
| LOGIN-5 | `/login`              | A correct OTP leaves you on the verify screen           |
| CB-1    | `/callback/$provider` | OAuth failure drops you on login with no message        |
| MFA-1   | `/mfa`                | Code boxes stay editable mid-verify and re-fire         |
| ONB-1   | `/onboarding`         | Invites are collected, promised, and never sent         |
| ONB-2   | `/onboarding`         | Onboarding completes against guessed deployment flags   |
| INV-1   | `/accept-invite`      | "You've joined!" then straight to the sign-in page      |
| SHELL-1 | App shell             | The whole shell tears down and rebuilds after login     |
| SHELL-2 | App shell             | Switching workspace does nothing, visibly               |
| SHELL-3 | App shell             | One flaky chunk breaks that feature until reload        |
| SHELL-4 | App shell             | ⌘K and Settings are dead clicks while loading           |
| SET-1   | Settings              | A failed notification save still looks saved            |
| SET-2   | Settings              | Notification toggles stack a toast each                 |
| SET-3   | Settings              | Security panel says 2FA is off before it knows          |
| SET-4   | Settings              | Failed webhooks fetch reads as "you have none"          |
| SET-5   | Settings              | Members search box eats every keystroke                 |
| SET-6   | Settings              | A post-create failure makes you create a second org     |
| SET-7   | Settings              | "Member removed" appears twice, row stays 5s            |
| X-1     | Shared                | Widget error fallbacks can never fire                   |
| X-2     | Shared                | Lists blank to skeletons on every keystroke             |

---

## 1 · Login — `/login`

### LOGIN-1 — The login form paints, then vanishes

**What happens.** On a cold load of the sign-in screen, the full method picker —
Continue with Google, GitHub, passkey, and the email panel — renders and is visible
for one frame. It is then replaced wholesale by the auto-Google spinner screen. The
user sees the page flash and rearrange itself before they can read it. This is the
most visible flicker on the first screen of the product.

**Why.** `AuthForm.tsx:95` declares `const [autoGooglePending, setAutoGooglePending] =
useState(false)`. The decision to auto-start Google sign-in is made inside an effect,
which runs _after_ the first commit. So React always paints the wrong branch first,
then corrects it.

**Fix.** Compute the initial value during render with a lazy initialiser, so the very
first commit is already correct:

```ts
const [autoGooglePending, setAutoGooglePending] = useState(
  () =>
    authMethods.oauthAutoGoogle &&
    authMethods.oauth.google &&
    shouldAttemptAutoGoogleSignIn(),
);
```

All three inputs are synchronous reads, so there is no reason to defer this to an
effect. This is the general rule the other login findings also point at: **state that
is knowable at render time should not be set in an effect.**

---

### LOGIN-2 — The auto-Google screen hides its own cancel button

**What happens.** Once the auto-Google screen appears, the user sees a bare
full-screen loader. The status text "Signing you in with Google…" and the "Use email
instead" escape link are both invisible and unclickable — even though they are in
the DOM. There is no way to opt out of auto sign-in.

**Why.** `AuthForm.tsx:211–239` renders `<FullPageSpinner />` as an ordinary flow
sibling of the text and the cancel button. But `FullPageSpinner.tsx:33` is
`fixed inset-0 z-50` with an opaque `bg-background`. The spinner therefore covers the
entire viewport, and the siblings — which have no stacking context of their own —
paint underneath it.

**Fix.** The full-page spinner is the wrong component here; it exists for boot and
route transitions where nothing else is on screen. Use an inline spinner instead:

```tsx
<Loader2 className="text-muted-foreground size-8 animate-spin" aria-hidden />
```

If you want to keep the full-bleed look, give the copy and cancel block its own
stacking context above it (`relative z-[60]`). The inline spinner is the better fix,
because it keeps this screen's content in normal flow and removes the trap entirely.

---

### LOGIN-3 — Login can strand permanently on the auto-Google spinner

**What happens.** The user reaches the auto-Google screen, the OAuth redirect never
fires, and the spinner stays forever. Combined with LOGIN-2, there is no visible way
out — the user must reload or navigate away manually. This is the most severe login
failure of the three, because the screen is unrecoverable.

**Why.** In `AuthForm.tsx:143–167` a single effect owns three things: a
`autoGoogleStartedRef` guard, the `autoGooglePending` flag, and an 800 ms timer. The
first run arms all three. The cleanup clears the timer but leaves the ref and the
pending flag set. The second run bails immediately at the ref guard, so the timer is
never re-armed — while `autoGooglePending` is still `true`.

This is not only a dev-mode StrictMode artefact. The dependency array includes
`pending` and `turnstileReady`, so **any** flip of those values inside the 800 ms
window re-runs the effect and reproduces it in production. Turnstile's
`expired-callback` (`InvisibleTurnstile.tsx:94`) does exactly that.

**Fix.** Keep the guard and the timer in the same owner so they can never
desynchronise. Either move both into a mount-only effect that owns its own timer, or
reset the guard alongside the timer in the cleanup:

```ts
return () => {
  if (autoGoogleTimerRef.current) clearTimeout(autoGoogleTimerRef.current);
  autoGoogleStartedRef.current = false;
  setAutoGooglePending(false);
};
```

Fix this together with LOGIN-2 — they compound into an unrecoverable screen, and
either fix alone still leaves the user stuck or blind.

---

### LOGIN-4 — Verify button spins while nothing is loading

**What happens.** The user requests an email sign-in code. The moment "code sent"
appears, the "Verify and continue" button shows a spinner and greys out, and the
resend link is disabled too. Typing the six-digit code does not re-enable it. If
Turnstile's error or expiry callback fires, it never recovers at all.

**Why.** The Turnstile token is single-use. Building the send request consumes it
(`turnstile-token-store.ts:54–63`), which clears `currentToken` and notifies
subscribers, so `turnstileReady` flips to `false` mid-request. `AuthMethodButton.tsx:69–74`
computes `spinning = loading || (captchaBlocking && nothingElsePending)`. Once the
send finishes and `onPendingChange?.(null)` runs, nothing is pending — so
`captchaBlocking` alone drives a spinner on a button that is doing nothing.

**Fix.** Two changes. First, stop treating captcha re-minting as a _method_ spinner —
a token being re-issued is not the same as a user action being in flight, and it
should not render as one. Second, add a re-mint timeout with an inline "verification
unavailable, retry" affordance so an expired or errored token is recoverable without
a reload. If you want the verify step to be reliably unblocked, mint its token at
send time rather than depending on a re-mint landing.

---

### LOGIN-5 — A correct OTP leaves you on the verify screen

**What happens.** The user enters the correct code and submits. Instead of moving on,
the verify screen stays exactly where it was — code still in the boxes, button
re-enabled. Naturally, they click again. The second attempt re-sends an
already-consumed code, which fails and paints a red error banner on a screen that is
about to disappear anyway. The user's last impression of a _successful_ login is an
error message.

**Why.** `AuthEmailPanel.tsx:236` calls `navigateAfterEmailLogin(navigate, location)`
without awaiting it — the navigation is fire-and-forget. The `finally` block at
`:248–250` then runs `onPendingChange?.(null)` immediately, including on the success
path, while the destination's guard chain (`requireAuth` → `requireProvisionedWorkspace`
→ `resolveActiveOrg` → `gatewayFromManifest`) is still awaiting network.

**Fix.** Success is not a state the form should return from. Clear the pending flag
only in the `catch` branches, and let the successful path stay pending until the
navigation resolves and the component unmounts:

```ts
} catch (err) {
  surfaceError(err);
  onPendingChange?.(null);     // only here
}
// no finally — success stays pending through the navigation
```

A terminal `'navigating'` state works equally well if you want the button label to
change. The important part is that **the form must not re-enable itself while a
successful navigation is still in flight.**

---

## 2 · OAuth callback — `/callback/$provider`

### CB-1 — OAuth failure drops you on login with no message

**What happens.** A user completes Google or GitHub sign-in, the token exchange
fails, and they see a spinner followed by the plain login form. There is no toast, no
banner, no error in the URL, and nothing in the analytics stream. From the user's
side it looks like the click simply didn't register, so they try the same broken flow
again.

**Why.** `CallbackPage.tsx:26–30`:

```ts
} catch {
  skipAutoGoogleSignIn();
  void navigate({ to: '/login', replace: true });
  return;
}
```

The catch is empty apart from the redirect. Note the asymmetry: the success path
captures two analytics events at `:24–25`, so a working sign-in is observable and a
broken one is not — exactly backwards for debugging a production auth problem.

**Fix.** Surface the failure in the UI and in telemetry. `AuthForm` already has a
`FormError` banner (`AuthForm.tsx:252–257`) that renders `role="alert"`, so the
cheapest correct fix is to redirect with an error param the login screen renders:

```ts
} catch (err) {
  reportError(err);
  captureAnalyticsEvent(ANALYTICS_EVENTS.authOauthFailed, { reason: mapFrontendError(err) });
  skipAutoGoogleSignIn();
  void navigate({ to: '/login', search: { error: 'oauth_failed' }, replace: true });
  return;
}
```

Add the matching `authOauthFailed` event so OAuth breakage is visible in dashboards.

---

## 3 · MFA — `/mfa`

### MFA-1 — Code boxes stay editable mid-verify and re-fire

**What happens.** The user types their six-digit TOTP code, which auto-submits. While
that request is in flight the input stays editable, so any correction re-triggers
`onComplete` and fires a second verification with the **same single-use MFA session
token** — which the backend rejects. On top of that, the "Verifying…" label flips back
to "Verify" while the page is still navigating, actively inviting one more submit.

**Why.** `MfaForm.tsx:137–141` wires `onComplete` straight to `handleSubmit`, and no
`disabled` prop is passed to `TotpCodeInput`. `onSubmit` (`:53`) has no in-flight
guard, and `void navigate(…)` at `:63` releases `isSubmitting` before the navigation
resolves. The sibling email flow gets this right — `AuthEmailPanel.tsx:361` passes
`disabled={emailBlocked || emailVerifyLoading}` — so this is an inconsistency, not a
missing pattern.

**Fix.** Three small changes, mirroring the email panel:

```tsx
<TotpCodeInput disabled={isSubmitting} … />
```

```ts
async function onSubmit(values) {
  if (isSubmitting) return;        // in-flight guard
  …
  await navigate({ … });           // hold submitting through the navigation
}
```

---

## 4 · Onboarding — `/onboarding`

### ONB-1 — Invites are collected, promised, and never sent

**What happens.** During onboarding the user is shown an invite step, types in two or
three teammate addresses, and continues. The Done step tells them "N invites
pending", a success toast confirms setup is complete — and **nothing is ever sent**.
No teammate receives anything, and the user has no reason to suspect it.

This is the most serious finding in the audit: the product reports success for work
it did not do, and the user only discovers it when colleagues say they never got an
invite.

**Why.** The send is gated on the organization the wizard _created_:

```ts
const failed =
  effectiveSteps.includes('invite') && organizationId
    ? await sendOnboardingInvites(data.invites)
    : 0;
```

`OnboardingPage.tsx:444–447`

In `personal-and-team` mode with an account that already has a team org,
`deriveOnboardingSteps` (`onboarding-flow.ts:29–31`) _does_ add the invite step,
because `hasTeam` is true. But `shouldCreateOrganizationOnFinish`
(`onboarding-flow.ts:39–49`) returns `false` in that mode, so `organizationId` is
`null`, the condition short-circuits to `0`, and the `else` branch fires
`notify.success` at `:458`. Two functions disagree about whether this mode has an
organization, and the disagreement is silent.

The sharpest detail: `activateWorkspaceAfterOnboardingFinish` (`:212–218`) has
already switched the access token to that existing team org by this point, so the
invites **would have worked**. And every invite test in `OnboardingPage.test.tsx:433–495`
runs in team-only mode, which is why the suite is green.

**Fix.** Key the send off the org that is actually active after activation, not the
one the wizard may or may not have created:

```ts
const targetOrgId = activatedContext?.activeOrganization?.id ?? organizationId;
const failed =
  effectiveSteps.includes('invite') && targetOrgId
    ? await sendOnboardingInvites(data.invites)
    : 0;
```

Then make the failure mode loud rather than silent: if the invite step ran and
collected addresses but `targetOrgId` is still missing, that is a bug, so report it
rather than toasting success. Add a `personal-and-team`-mode test that asserts
invitation rows exist afterwards — the current suite cannot catch this.

---

### ONB-2 — Onboarding completes against guessed deployment flags

**What happens.** If `me/context` fails while the wizard is open, onboarding does not
show an error. It silently renders a _different_ set of steps, skips workspace
creation entirely, still marks the account as onboarded, and navigates to
`/dashboard` — a surface a team-only deployment does not have. Because
`completeOnboarding` has already fired, the user cannot be sent back through the
wizard; they land in a broken state permanently.

**Why.** `OnboardingPage.tsx:346–348` derives the step list from
`useDeploymentFlags()`, which falls back to
`DEFAULT_DEPLOYMENT_FLAGS = { personalOrganizations: true, teamOrganizations: true }`
(`deployment-mode.ts:36–39`). That resolves to `personal-and-team`, which drops the
workspace step and creates no org. There is no gate on `meContext` being present and
no error UI anywhere in the wizard.

**Fix.** The wizard cannot make correct decisions without loaded context, so it
should not try. Gate the body on the query state and render a retry:

```ts
const meCtx = useMeContext();
if (meCtx.isPending) return <OnboardingSkeleton />;
if (meCtx.isError || !meCtx.data) return <RetryError onRetry={meCtx.refetch} … />;
```

Derive `effectiveSteps` only from loaded context, and block `finish()` while the
context is unresolved. The general principle: **a permissive default is the wrong
fallback for a decision that is one-way.**

---

## 5 · Accept invite — `/accept-invite/$invitationId`

### INV-1 — "You've joined!" then straight to the sign-in page

**What happens.** An invitee opens their invite link. They see a green check and
"You've joined!" — and 900 ms later they are looking at the sign-in page with no
explanation. The membership genuinely was created, so the database and the screen
disagree.

**Why.** `AcceptInvitePage.tsx:91–97`:

```ts
} catch {
  setStatus('success');
  setTimeout(() => void navigate({ to: '/login', replace: true }), ACCEPT_INVITE_REDIRECT_MS);
}
```

This catch wraps `switchToOrganization` **and** `silentRefresh` (`:73–74`) — steps
that run _after_ the invitation was accepted. Any failure there paints success and
redirects to login. The catch is also completely empty, so the error is never logged
or reported. There is a further wrinkle: `switchToOrganization` legitimately returns
`undefined` when superseded (`switch.ts:71`), which is not an error but is
indistinguishable from one downstream.

**Fix.** Separate the two outcomes. The acceptance succeeded, so keep the success
state — but send the user somewhere they can actually use, and say what went wrong:

```ts
} catch (err) {
  reportError(err);
  notify.warning(t(keys.joinedButSwitchFailed));
  setStatus('success');
  setTimeout(() => void navigate({ to: '/', replace: true }), ACCEPT_INVITE_REDIRECT_MS);
}
```

`/` is the resolver route, so it will work out the right destination from the session
rather than assuming the user is signed out.

---

## 6 · App shell — `shared/layouts/AppLayout/`

### SHELL-1 — The whole shell tears down and rebuilds after login

**What happens.** On a personal-only deployment, the user signs in and sees a full
sidebar application shell. That shell — sidebar, header, and the routed page inside
it — is then replaced by a small "Loading…" strip on an otherwise blank page, and
finally a completely different top-nav shell mounts. Because `<Outlet/>` remounts
with it, the dashboard refetches and scroll position is lost.

I reproduced this live: with the app on `/organization/…/dashboard`, the DOM
contained `[data-testid="layout-variant-fallback"]`, no sidebar, and a body whose
entire text was "Skip to main content / Loading".

**Why.** `AppLayout.tsx:62–64` computes
`resolveAppShellVariant(useDeploymentMode(), themeVariant)`. Before `me/context`
resolves, `useDeploymentMode()` reads the permissive `DEFAULT_DEPLOYMENT_FLAGS` and
returns `personal-and-team`, which selects the **SidebarShell**. When the real
context lands it becomes `personal-only`, selecting the **FocusShell** — a different
`React.lazy` chunk. Swapping the component identity unmounts the entire tree, and the
Suspense fallback is `LayoutVariantFallback.tsx:9–15`, a bare `min-h-24` box
containing the word "Loading".

**Fix.** Don't pick a shell until you know which one is right:

```tsx
const meCtx = useMeContext();
if (meCtx.isPending) return <AppShellSkeleton />; // or hold the boot splash
```

If you would rather not block, keep the current shell mounted and swap inside a
`startTransition` after preloading the target chunk, so the old tree stays on screen
until the new one is ready. Either way, `LayoutVariantFallback` is far too bare to be
a whole-app fallback — it was written for a small region, and using it here is what
makes the flash so stark.

---

### SHELL-2 — Switching workspace does nothing, visibly

**What happens.** The user opens the organization switcher and clicks "Personal
workspace". The menu closes and **nothing happens** for the length of a network round
trip — no spinner, no progress bar, no disabled state. On a slow connection this
reads as a broken button, so they click again. If the request fails, nothing happens
_ever_: no toast, no error, still on the old org.

**Why.** `OrganizationSwitcher.tsx:79–92` awaits `switchToPersonal()` _before_
starting navigation. `RouteProgressBar` keys off `routerState.status === 'pending'`
(`RouteProgressBar.tsx:15`), which is still idle during that POST, so the app's one
piece of global navigation feedback does not fire. The `disabled={isLoading}` at
`:138` only covers the initial `me/context` load, not the switch. And the failure is
swallowed by `applySelect(org).catch(() => undefined)`.

**Fix.** Track which row is switching and reflect it, then surface failures:

```tsx
const [switchingId, setSwitchingId] = useState<string | null>(null);
…
try {
  setSwitchingId(org.id);
  await switchToPersonal();
  void navigate({ to: '/dashboard' });
} catch (e) {
  notify.error(mapApiError(e));
} finally {
  setSwitchingId(null);
}
```

Disable the trigger and spin the active row while `switchingId` is set. An empty
catch on a user-initiated action is never right — if the switch fails, the user must
be told, because their next action depends on which org they think they are in.

---

### SHELL-3 — One flaky chunk breaks that feature until reload

**What happens.** A single failed chunk fetch permanently breaks that feature for the
rest of the session. Worse, for Settings and Appearance the failure replaces the
**entire page** with "Something went wrong", because those lazy components sit under
the root/route error boundary — so a failed _optional_ modal takes down the route
behind it. Retry buttons do nothing at all; only a full reload recovers.

**Why.** `React.lazy` caches the _rejected_ promise and re-throws it on every
subsequent render. The affected call sites are `Dashboard.deferred.tsx:5–23`,
`CommandPaletteLazy.tsx:5–9`, `SettingsModalLazy.tsx:10–12` and
`AppearanceDialogLazy.tsx:11–13`. Resetting an error boundary re-renders the same
cached rejection, which is why Retry is inert — the giveaway is that clicking it
produces **no new network request**.

The codebase already contains the fix: `lib/lazy-module.ts` exposes `onceAsync`,
documented as "A rejection is NOT cached", and it is applied to the layout variants.
It was simply never applied to these five.

**Fix.** Two parts. Wrap every `lazy()` factory in the existing helper:

```tsx
const CommandPalette = lazy(
  onceAsync(() =>
    import('./CommandPalette.tsx').then((m) => ({ default: m.CommandPalette })),
  ),
);
```

Then give each lazy overlay its own local error boundary, so a failed optional modal
can never blank the page behind it. A modal chunk failing should cost you the modal,
not the route.

---

### SHELL-4 — ⌘K and Settings are dead clicks while loading

**What happens.** Press ⌘K on a cold cache and **nothing renders at all** — no scrim,
no dialog frame, no spinner — for as long as the chunk takes. The user assumes the
shortcut didn't register and presses it again, which toggles the palette back closed,
so it stays shut when the chunk finally lands. Same for Settings and Appearance.

**Why.** All three overlays use `<Suspense fallback={null}>` —
`CommandPaletteLazy.tsx:35–37`, `SettingsModalLazy.tsx:50–54`,
`AppearanceDialogLazy.tsx:35–39`. The idle prefetch in `chunk-prefetch.ts:32–63`
only runs after paint plus `requestIdleCallback` on authenticated non-funnel routes,
so there is a real window where the chunk is cold. Settings is the worst of the
three, because `SettingsModal.tsx:40–49` statically imports all ten panels into one
large chunk.

**Fix.** `fallback={null}` is never right for a user-initiated overlay — the click
must produce feedback immediately. Render a scrim plus a correctly-sized skeleton
dialog:

```tsx
<Suspense fallback={<DialogSkeleton size="lg" />}>
```

Sizing the skeleton to the real dialog also avoids a layout jump when it fills in.
Consider splitting the settings panels so the shell arrives before all ten.

---

## 7 · Settings — `#settings/…`

### SET-1 — A failed notification save still looks saved

**What happens.** The user turns on a notification preference. The save fails, an
error toast flashes past — and the switch **stays on for the rest of the session**.
They believe the preference saved. Only a full page reload reveals it never did.

**Why.** `AccountNotificationsPanel.tsx:112–115`:

```ts
const nextOverrides = { ...overrides, [prefKey(category, channel)]: value };
setOverrides(nextOverrides);
update.mutate(buildMatrix(serverPrefs, nextOverrides));
```

The switch is driven by a local `overrides` map, which `isEnabled` consults _first_
(`:92–93`). That map is never reverted on error and never cleared on success, so it
permanently shadows server truth. `useAppMutation` does have rollback — but it
restores the **query cache**, which this panel isn't reading from, so the rollback is
invisible here. `update.isPending` is never read either, so the switch isn't disabled
while in flight.

**Fix.** Make the local override obey the mutation lifecycle:

```ts
update.mutate(buildMatrix(serverPrefs, nextOverrides), {
  onError: () =>
    setOverrides((o) => {
      const n = { ...o };
      delete n[key];
      return n;
    }),
  onSuccess: () =>
    setOverrides((o) => {
      const n = { ...o };
      delete n[key];
      return n;
    }),
});
```

On success the key is dropped so the server value takes over; on error it is dropped
so the switch snaps back. Also pass `disabled={update.isPending}` on the switch being
changed. The deeper lesson: **an optimistic update needs its rollback to live in the
same place as the optimistic write** — here that's local state, not the query cache.

---

### SET-2 — Notification toggles stack a toast each

**What happens.** Flipping four notification switches produces four identical success
toasts, stacked, filling the toast region to its cap.

**Why.** `useNotifications.ts:96–110` gives the mutation a `successMessage`, and the
panel calls it on every individual flip. `notify.show` only de-dupes when an explicit
`id` is supplied (`notify.ts:39`), and none is passed.

**Fix.** Give the toast a stable id so repeat fires replace rather than stack:

```ts
successMessage: … ,
toastId: 'notification-prefs',
```

For a settings surface where every change auto-saves, an inline "Saved" indicator
next to the section is a better fit than a toast at all — toasts are for things the
user needs to notice, and a preference saving is expected.

---

### SET-3 — Security panel says 2FA is off before it knows

**What happens.** Opening Settings → Account → Security shows the 2FA badge reading
**Disabled** with a "Set up" button, and a security score computed as if 2FA were
off. A beat later both flip to the correct values. If the status request fails
outright, the panel claims 2FA is off **permanently**, with no error anywhere — a
user could reasonably re-enrol and invalidate their existing authenticator.

**Why.** `AccountSecurityPanel.tsx:53` and `:453–454`:

```ts
const { data: mfaEnabled = false } = useMfaStatus();
const { data: passkeys = [] } = usePasskeys();
```

The default value is applied while pending _and_ on error alike, and neither
`isPending` nor `isError` is read anywhere in the file. "No data yet" and "2FA is
off" are rendered identically.

**Fix.** Never let a security-relevant default stand in for an unknown. Branch
explicitly, or wrap the cards in the existing `QueryBoundary`:

```tsx
<QueryBoundary
  query={mfaQuery}
  loading={<SecurityBadgeSkeleton />}
  errorMessage={t(keys.securityLoadFailed)}
>
  {(status) => <TwoFactorCard enabled={status.enabled} />}
</QueryBoundary>
```

Of all the missing-error-branch findings, this one matters most, because the wrong
answer pushes the user toward a destructive action.

---

### SET-4 — Failed webhooks fetch reads as "you have none"

**What happens.** When the webhooks request fails, the user sees a bare "Webhooks /
Add webhook" heading and nothing else — no list, no empty state, no error. The
obvious conclusion is that no webhooks are configured, which may be badly wrong for
someone auditing their integrations.

**Why.** `OrganizationIntegrationsPanel.tsx:165` destructures only
`{ data: hooks, isLoading }`. On failure `hooks` is `undefined`, so the
`hooks && hooks.length === 0` empty-state check at `:217–227` is falsy, the list
renders nothing, and there is no error branch to fall through to. Every branch
quietly declines to render.

**Fix.** Add the error branch, matching what Members and Roles already do:

```tsx
const { data: hooks, isLoading, isError, refetch } = useWebhooks();
…
{isError ? <RetryError message={t(keys.webhooksLoadFailed)} onRetry={refetch} /> : null}
```

More generally, prefer `QueryBoundary` for these panels — the bug exists because the
three states were hand-rolled and one was forgotten.

---

### SET-5 — Members search box eats every keystroke

**What happens.** In Settings → Organization → Members, typing in the search box
filters the rows — but the box itself stays visually empty. Every character the user
types disappears. The "Reset" button that should appear once a filter is active never
does. The search appears comprehensively broken even though filtering works.

**Why.** `DataTableToolbar.tsx:37, 44–47`:

```ts
const isFiltered = useMemo(() => table.state.columnFilters.length > 0, [table]);
const searchValue = useMemo(
  () => (searchColumn?.getFilterValue() as string) ?? '',
  [searchColumn],
);
```

TanStack Table builds its instance once and keeps a stable identity across renders,
so `table` — and therefore `searchColumn` — never changes. Both memos are computed at
mount and frozen forever. The input is controlled with `value={searchValue}`, so it
is pinned at `''`.

**Fix.** These values are cheap derived reads; memoising them buys nothing and is
what breaks them. Delete both memos:

```tsx
const searchColumn = searchColumnId ? table.getColumn(searchColumnId) : undefined;
const searchValue = (searchColumn?.getFilterValue() as string) ?? '';
const isFiltered = table.getState().columnFilters.length > 0;
```

Note `table.getState()` rather than `table.state` — the getter returns current state,
which is the point. **A memo whose dependency is a stable object identity will never
recompute; that is the bug pattern to look for elsewhere.**

---

### SET-6 — A post-create failure makes you create a second org

**What happens.** The user creates an organization. Something after the create step
fails, and they are shown a _form validation_ error while the dialog stays open. The
natural response is to adjust the form and submit again — which creates a **duplicate
organization**, because the first one was already created successfully.

**Why.** `CreateOrganizationDialog.tsx:97–101` wraps `createOrganization`,
`hydrateSessionContext`, `switchToOrganization`, `invalidateQueries` **and**
`navigate` (`:79–96`) in one `catch`, which discards the real error and shows a
generic "check the form" message. Five operations with very different failure meanings
are reported identically, and the one message chosen is the one that invites a retry
of the destructive step.

**Fix.** Scope the catch to the step whose failure means "the org was not created",
and let the rest fail with their own recoverable messaging:

```ts
let org;
try {
  org = await createOrganization(values);
} catch (e) {
  setFormError(mapApiError(e));    // this one is genuinely a form problem
  return;
}
try {
  await hydrateSessionContext();
  await switchToOrganization(org.id);
  …
} catch (e) {
  notify.warning(t(keys.createdButSwitchFailed));   // created — do not retry create
  void navigate({ to: '/' });
}
```

The same shape applies to INV-1: once the irreversible step has succeeded, later
failures must never be reported in a way that invites repeating it.

---

### SET-7 — "Member removed" appears twice, and the row stays for five seconds

**What happens.** Removing a member fires a success toast **immediately**, while the
member is still visibly listed. Five seconds later the request actually runs and a
**second** success toast appears. If the user closes Settings inside that window, the
delete still commits from an unmounted component.

**Why.** `notifyDeferredCommit` (`notify-deferred.ts:48`) fires
`notify.success(pendingMessage)` up front, then runs the mutation after the undo
delay. That mutation's own `useAppMutation` `successMessage` (`useMembers.ts:70–73`,
`useRoles.ts:92–95`) toasts again. Meanwhile the optimistic row removal only happens
at commit time, so the list contradicts the toast for the whole five seconds. Used at
`OrganizationMembersPanel.tsx:310–319` and `OrganizationRolesPanel.tsx:260–269`.

**Fix.** Three changes for one coherent undo pattern:

1. Suppress the hook's `successMessage` on deferred paths (or have both use the same
   toast `id`), so there is exactly one toast.
2. Apply the optimistic removal **at schedule time**, so "removed" and the list agree.
   Restore the row if the user hits Undo.
3. Cancel the pending timer on unmount so closing the modal doesn't commit a delete
   the user may have intended to undo.

The pending toast should also read as pending — "Removing member… Undo" — rather than
announcing a completed action that hasn't happened.

---

## 8 · Cross-cutting — fix these first

These four live in shared primitives. Each is a single file, and between them they
close or soften a large share of everything above.

### X-1 — Widget error fallbacks can never fire

**What happens.** When a fetch fails, the widget error card never appears. The org
switcher, the email-verification banner and the notification bell each render empty
instead. The translated copy for exactly these cases already exists in `errors.json`
under `widget.organizationSwitcher`, `widget.emailBanner` and `widget.notifications` —
it is simply unreachable.

**Why.** `WidgetErrorBoundary.tsx` is a plain `react-error-boundary`, which catches
**render-time throws only**. A TanStack Query in an error state does not throw — it
returns `isError`. And `throwOnError` and `useSuspenseQuery` appear **nowhere** in
`src/`, so no query in the codebase ever throws into these boundaries. They are wired
around the right widgets and can never trigger.

There is a second defect in the same component: `resetErrorBoundary` resets the
boundary but does not reset the query, so even a genuine render throw would re-render
the same failed cache and the error would return instantly.

**Fix.** Make the queries these boundaries wrap actually throw, and make Retry
refetch:

```tsx
const ctx = useMeContext({ throwOnError: true });
```

```tsx
<QueryErrorResetBoundary>
  {({ reset }) => (
    <ErrorBoundary onReset={reset} fallbackRender={…}>{children}</ErrorBoundary>
  )}
</QueryErrorResetBoundary>
```

Alternatively, move those widgets onto `QueryBoundary`, which already handles the
tri-state correctly. Either way, pick one mechanism — right now the app has two
error surfaces and the widgets are wired to the one that cannot see their failures.

---

### X-2 — Lists blank to skeletons on every keystroke

**What happens.** Any list keyed on search, sort or filter parameters empties itself
and shows skeletons on every change, then refills. Typing in the members search makes
the list flicker and the container height jump on each debounced keystroke.

**Why.** Search and sort are part of the query key, so each change is a cache miss and
`isPending` flips true. `placeholderData` and `keepPreviousData` return **zero matches**
across `src/` — neither `useCursorList.ts:38–44` nor `useList.ts:14–17` sets them.

**Fix.** One line in each shared hook:

```ts
import { keepPreviousData } from '@tanstack/react-query';

const query = useInfiniteQuery({
  queryKey: args.queryKey,
  queryFn: ({ pageParam }) => args.queryFn(pageParam),
  placeholderData: keepPreviousData,
  …
});
```

Then have consumers dim on `isFetching` instead of swapping in a skeleton — the rows
stay put and the list stops jumping. This single change fixes the flicker in the
members, roles and API-key panels at once.

---

### X-3 — Query failures are silent by default _(medium, listed here because it explains several highs)_

`queryClient.ts:38–42` only toasts when a query sets `meta.notifyOnError === true`.
Across **19 query call sites, exactly zero set it.** That is the reason SET-3, SET-4
and X-1 all present as "empty" rather than "failed": nothing surfaces a query error
unless the individual component remembers to.

**Fix.** Default it on in the shared hooks and let callers opt out, so silence has to
be chosen deliberately rather than happening by omission.

---

### X-4 — The standard CRUD hooks will inherit all of this _(medium, latent)_

`useCreate.ts:11–16`, `useUpdate.ts:12–18` and `useDelete.ts:10–15` are raw
`useMutation` calls with no error handling, no success toast and no rollback — and
they `await invalidateQueries` inside `onSuccess`, so `isPending` stays true through
every refetch and a submit button spins long after the write finished.

They currently have **no consumers**, so nothing is broken today. But `CLAUDE.md`
points new resource pages at them, so the first one built will inherit silent
failures and stuck buttons.

**Fix.** Rebuild all three on `useAppMutation`, which already does rollback,
invalidation and toasts correctly, and stop awaiting the invalidation inside
`onSuccess`.

---

## Suggested order of work

1. **Shared primitives — X-1, X-2, X-3, and `QueryBoundary`'s disabled-query gate.**
   Four files. Restores error visibility across the app, stops the list flicker, and
   closes several page-level rows as a side effect.
2. **The login screen — LOGIN-1, LOGIN-2, LOGIN-3 together.** They compound into an
   unrecoverable first screen; any one fix alone still leaves the user stuck or blind.
3. **Duplicate and lost writes — MFA-1, LOGIN-5, SET-6, SET-7.** Each can produce a
   duplicate or wrongly-timed write: a re-used MFA token, a second organization, a
   delete that commits after the modal closed.
4. **Silent and false outcomes — ONB-1, INV-1, CB-1, SET-1, SET-3, SET-4.** The app
   currently reports success it did not achieve and failure it never mentions. ONB-1
   and SET-1 are the two users would report as bugs in writing.
5. **The shell teardown — SHELL-1, SHELL-3, SHELL-4.** The most visible flicker in the
   product, plus the two lazy-loading gaps that make ⌘K and Settings feel broken.

---

## Patterns worth extracting

Most of these 23 are instances of five recurring mistakes. Fixing the instances is
worth less than naming the patterns in review:

- **State knowable at render time is being set in an effect.** LOGIN-1, SHELL-1,
  INV-4. The first paint is always wrong, then corrected.
- **A default value stands in for "unknown".** SET-3, ONB-2, SHELL-1. `= false` and
  `= []` make "still loading", "failed", and "genuinely empty" indistinguishable.
- **One `catch` spans several operations with different meanings.** SET-6, INV-1,
  CB-1. The message chosen usually invites retrying the irreversible step.
- **Success is signalled before it happened.** SET-7, ONB-1, LOGIN-5. The UI and the
  server disagree, and the user trusts the UI.
- **An optimistic write and its rollback live in different places.** SET-1. The
  rollback runs and changes nothing the user can see.
