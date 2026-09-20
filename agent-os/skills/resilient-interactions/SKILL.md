---
name: resilient-interactions
description: The worked reasoning behind the 31 always-on resilient-interaction rules — the concrete failure each one came from, the wrong fix, and the code that actually holds. Use when applying or arguing with a rule from agent-os/rules/resilient-interactions.mdc, when a write can double-submit, when a component crash escapes its boundary, when a success message can outrun the work, or when a screen derives its shape from a query.
---

# Resilient interactions — the reasoning

`agent-os/rules/resilient-interactions.mdc` carries the 31 rules as one-liners so
they cost almost nothing in a session that never needs them. This skill carries
what a one-liner cannot: the failure each rule came from, the fix that looked
right and was not, and the code that actually holds.

Section numbers here match the rule file exactly — code cites them by number
(`§1`, `§6`), so they are load-bearing. Never renumber.


# Resilient Interactions

Thirty-one failure modes cost real money, a whole screen, or the user's trust. Each has a house
answer; use it rather than re-solving per feature.

## 1. Writes are single-flight — never trust `disabled` alone

**Rule: no user gesture may produce two writes.** Checkout, plan change, add-payment-method,
invite, delete — one click, one server write.

`disabled={isPending}` is the **affordance**, not the guarantee. `isPending` only turns true
after React re-renders, so the control stays live for the frame after the first click. A
double-click, a bouncing touch target, or a "did that register?" second tap all fire the
handler again inside that window. On checkout that is a second charge.

**Use `useAppMutation` for every write.** It carries a synchronous ref guard: a second
`mutate` / `mutateAsync` while the first is in flight joins that promise instead of starting
a second request. Keep `disabled={isPending}` for the visible state — the guard is the
correctness net underneath it.

```tsx
const selectPlan = useSelectBillingPlan(); // built on useAppMutation

<Button disabled={selectPlan.isPending} onClick={() => void handlePlanSelect(plan.id)}>
  Choose {plan.name}
</Button>;
```

**Hand-rolled async handlers must guard themselves.** A `useState` flag is not enough — pair
it with a ref that flips synchronously:

```tsx
const isAddingRef = useRef(false);

async function handleAddPaymentMethod() {
  if (isAddingRef.current) return;
  isAddingRef.current = true;
  setIsAdding(true); // visible state
  try {
    await billingApi.createPaymentMethodSetup();
  } finally {
    isAddingRef.current = false;
    setIsAdding(false);
  }
}
```

The fetch client already attaches an `X-Idempotency-Key` per logical write, so the backend
can collapse a retry — that is defence in depth for the network layer, **not** a substitute
for this guard, which stops the second request being made at all.

**Testing a double submit properly.** `fireEvent.click` flushes React between calls, so the
disable lands and the test passes even with no guard. Dispatch both clicks inside one `act()`
batch to reproduce the real window:

```tsx
act(() => {
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
expect(createPaymentMethodSetup).toHaveBeenCalledTimes(1);
```

## 2. A component crash stays inside that component

**Rule: a throw in one widget must never blank the page or the app.** Wrap each independently
failing surface so the rest of the screen survives.

The ladder, outermost to innermost — each already exists, so reach for it rather than adding
a new boundary type:

| Scope                          | Use                                        |
| ------------------------------ | ------------------------------------------ |
| Whole app (last resort)        | `ErrorBoundary` in `src/App.tsx`           |
| One route                      | `RouteErrorBoundary` via `errorComponent`  |
| One panel / widget / section   | `SectionErrorBoundary` (`WidgetErrorBoundary/`) |
| A failing **query**, not a throw | `QueryBoundary`                          |

```tsx
<SectionErrorBoundary title="Billing" testId="settings-panel-error-billing">
  <AccountBillingPanel />
</SectionErrorBoundary>
```

Wrap a surface when it renders independent data, is one of several siblings, or is fed by a
third party (Stripe, charts, embeds). Do **not** wrap every leaf — a boundary around a button
just hides bugs. `SectionErrorBoundary` renders a retry affordance and reports through the
same `notify` / logging surface, so a contained failure is still visible, never silent.

New composed surfaces (a dashboard widget, a settings panel, a route island section) ship
with their boundary in the same change — not as a follow-up.

**A boundary that cannot catch what actually fails is decoration.** A React boundary sees a
`throw` during render and nothing else. These widgets do not throw — they **fetch**. A rejected
query just flips `isError` on its observer; the widget renders its empty/placeholder branch, and
the wrapper with its translated "… unavailable" copy sits there unreachable. The org switcher
showed "Select organization" over an empty list, the email banner rendered nothing at all, and
neither fallback could ever appear (X-1).

**Choose the surface by what it costs the layout.** Every failure must be visible and retryable;
where it appears is a design decision, and there are exactly two house answers:

| The widget is…                              | Surface                                                    |
| ------------------------------------------- | ---------------------------------------------------------- |
| A page section that owns its own space       | `throwOnError: true` → `SectionErrorBoundary` in its place |
| **App chrome** — header, rail, banner, nav   | `notifyOnError: true` → one toast, carrying a Retry        |

Swapping a header control for an error card reflows the chrome around a control the user is
mid-reach for, and it does it while they are already having a bad time. The toast says the same
thing, keeps the switcher's last known label in place, and moves nothing:

```tsx
// chrome: the failure arrives beside the widget, not instead of it
const { data: ctx } = useMeContext({ notifyOnError: true });

// a page section: the fallback takes the space the section already had
const { data } = useSomething({ throwOnError: true });
<QueryErrorResetBoundary>
  {({ reset }) => <ErrorBoundary onReset={reset} fallbackRender={…}>{children}</ErrorBoundary>}
</QueryErrorResetBoundary>;
```

- **Either way, Retry must refetch.** The toast's action calls
  `queryClient.refetchQueries({ queryKey })`; the boundary's Retry resets the failed query through
  `QueryErrorResetBoundary`. A Retry that only re-renders a dead observer is silence with extra
  steps.
- **Pick one owner per widget.** Throw, toast, or an inline `QueryBoundary` — exactly one. Two is
  a duplicate report; none is X-1.
- **Every mount site must be wrapped before you make a component throw.** One unwrapped usage (the
  desktop sidebar switcher) turns a contained widget failure into a blanked app.
- **Match the fallback to the surface.** A 120px card inside a 56px header breaks the layout it is
  protecting — `variant="inline"` exists for the boundaries that do sit in chrome (render throws
  still land there).
- **Check the copy resolves.** `t(ERRORS_KEYS.widget.x)` from a component bound to another
  namespace renders the raw key. Nobody noticed, because the fallback never rendered.
- **Test the fallback through a failing *query*, not a `throw`.** A `Boom` component passes on this
  bug. `queryFn.mockRejectedValue(...)` plus "Retry calls queryFn a second time" does not — and
  keep `gcTime` at its default in that test, or the remount refetches on its own and the assertion
  passes with the reset wiring deleted.

## 3. A success message never outruns the work

**Rule: the toast must describe what actually happened.** If a step was skipped, the user is
told — silence is worse than an error, because the user walks away believing it is done.

The failure shape is always the same: a multi-step submit gates one of its steps on a value
that is legitimately empty in some flow, the step is skipped, and the success path runs
anyway because "no failures" and "no attempts" are the same number.

```tsx
// WRONG — `failed` is 0 both when every invite succeeded and when none were tried.
const failed = targetId ? await sendInvites(emails) : 0;

// RIGHT — nothing sent is a partial failure, not a success.
const failed = targetId ? await sendInvites(emails) : emails.length;
```

Checklist for any submit that fans out into several writes:

- Every branch that **skips** work reports it — reuse the partial-failure path the flow
  already has rather than inventing new copy.
- Gate the work on the value it is actually scoped by. Onboarding invites are scoped by the
  **active-org** token, so the created org id was never the right gate (ONB-1).
- A regression test asserts the *count* of requests that left the client, not just that the
  flow completed. `expect(inviteMember).toHaveBeenCalledTimes(3)` is the assertion that
  fails on this bug; "navigates to the dashboard" passes either way.

## 4. Never derive a flow from state that has not loaded

**Rule: if a query decides what the user sees or what a submit does, gate on it.** Render the
query state instead of the screen — never a screen built on a fallback.

A "sensible default" for missing data is the trap. `useDeploymentFlags` falls back to the
permissive `DEFAULT_DEPLOYMENT_FLAGS`, so a failed `me/context` did not look broken — it
looked like a *different deployment*. The onboarding wizard then showed the wrong step list,
skipped creating the workspace, and still let the user press the finish button, which stamps
`onboarding_completed` on the backend (ONB-2). Not reversible from the UI.

```tsx
const query = useMeContext();
const ready = !(query.isPending || query.isError) && Boolean(query.data);

// Steps derived ONLY from a loaded context — never from the fallback.
const steps = ready ? deriveSteps(flags, query.data) : EMPTY_STEPS;

if (!ready) {
  return (
    <QueryBoundary query={query} errorMessage={t(KEYS.session.loadError)}>
      {() => null}
    </QueryBoundary>
  );
}
```

- **`isError` counts even when stale `data` is still cached.** A background refetch that failed
  means the context you would submit against is one you already know is out of date.
- **The submit needs its own guard, not just `disabled`.** Same shape as rule 1: the disabled
  button is the affordance; `if (!ready) return;` at the top of the handler is the correctness
  net. Irreversible writes (completion flags, provisioning, charges) earn both.
- **Reach for `QueryBoundary`, not a bespoke spinner** — skeleton while pending, retry on
  failure, in place. A wizard that strands the user is worse than one that says "try again".
- Ask of every fallback default: *would the user notice if this were wrong?* If not, it is not
  a default, it is a silent bug.

## 5. Local optimistic state gets rolled back too

**Rule: an optimistic edit you hold outside the query cache is yours to revert.**
`useAppMutation`'s `optimistic` / `optimisticInfinite` rollback restores the **cache**. A
`useState` map of local overrides is invisible to it, so nothing puts it back.

The shape to watch for is "derive the view from server data + a local edit map":

```tsx
const [overrides, setOverrides] = useState<Record<string, boolean>>({});
const value = overrides[key] ?? serverValue; // local edit wins
```

That map needs the full lifecycle, or the control silently misreports state:

| Moment      | What must happen                                                            |
| ----------- | --------------------------------------------------------------------------- |
| on error    | restore the key to what it was — `undefined` means **delete it**, not write the old value back |
| on success  | **clear the committed keys** — the cache now holds server truth, and a leftover override shadows every later refetch |
| while saving| disable the control (`isPending`) **and** guard the handler with a ref (rule 1) |

```tsx
update.mutate(buildPayload(server, next), {
  onSuccess: () => setOverrides((o) => withoutCommitted(o, committedKeys)),
  onError: () => setOverrides((o) => withRestoredOverride(o, key, previous)),
});
```

The clear-on-success half is the one that gets forgotten: the toggle keeps working, so nothing
looks broken — until the server changes underneath it and the control stops following (SET-1).

**Prefer not to hold the state at all.** If the cache can carry the optimistic value
(`optimistic` / `optimisticInfinite` on `useAppMutation`), use that and delete the local map —
one rollback path instead of two.

**Test it against server truth, not against itself.** Assert the control matches what the fake
backend actually stored, and that it still follows a *later* server change. "The toggle flipped"
passes on this bug; "the toggle agrees with the server" does not.

## 6. A failed follow-up step never routes the user backwards

**Rule: when step A succeeded and step B failed, keep A's result, say what B cost, and land
somewhere forward.** Never let a `catch` around the follow-up throw away the work that already
committed on the server.

The shape is a two-step flow — *do the thing*, then *put the user where the thing lives* — with
one `try` around both:

```tsx
// WRONG — the accept already committed; this reports success and signs them out anyway.
try {
  await switchToOrganization(accepted.organizationId);
  await silentRefresh();
  setStatus('success');
  redirect(dashboard);
} catch {
  setStatus('success'); // the lie
  redirect('/login'); // the harm — and the error is never logged
}
```

Accept-invite did exactly this: a green check and "You've joined!", then 900 ms later the
sign-in page, with no explanation and nothing in Sentry (INV-1).

- **A bare `catch {}` with no binding is the tell.** If you are not naming the error, you are not
  reporting it. Every swallowed failure gets `reportError(err, { scope, …ids })`.
- **Separate what committed from what did not.** Fire the analytics/success signal for the step
  that actually landed, and give the degraded outcome its own state (`partial`), its own copy,
  and its own `notify.warning` — not the happy-path string.
- **Recovery goes forward, never back to the door.** `/` (the resolver) or the nearest surface the
  user can act from. Sending a signed-in user to `/login` because a *secondary* call failed
  destroys the thing they just did.
- **Test the destination, not the icon.** `expect(navigate).not.toHaveBeenCalledWith({to: '/login'})`
  is the assertion that fails on this bug; "shows the success check" passes either way.

## 7. A repeatable confirmation replaces itself

**Rule: if a user can fire the same write several times in a few seconds, its toast carries a
stable id.** Sonner **replaces** a toast that reuses an id and **stacks** one that does not.

Any grid of switches, row of toggles, or inline-save field is a repeat-fire control. Four flicks
in the notifications grid stacked four copies of "Notification preferences saved" over the
screen the user was still working in (SET-2) — the app shouting the same sentence four times.

```tsx
export const PREFS_TOAST_ID = 'notification-preferences-saved';

useAppMutation({
  mutationFn: savePreferences,
  successMessage: t(KEYS.saved),
  toastId: PREFS_TOAST_ID, // success AND error reuse it
});
```

- **Give the id to the error toast too.** A failure should replace a stale "saved", not land
  underneath one that is still claiming success.
- **Omit it for one-off writes** — "Invitation sent to sam@" and "Invitation sent to kai@" are
  different facts and both deserve to be read.
- **A toast is not the only answer.** For a control that saves constantly, an inline "Saved"
  next to the field beats any toast; reach for the id when a toast is still the right surface.
- **Test the rendered count, not the call count.** `notify.success` firing four times is correct
  and expected — the assertion that catches this is how many toasts are in the DOM.

## 8. Every query renders all three of its states

**Rule: `data`, `isPending` and `isError` are one unit — destructure all three or none.**
A default value (`?? false`, `?? []`, `?? 0`) is a **claim**, and the user cannot tell it apart
from a real answer.

```tsx
// WRONG — three different situations, one indistinguishable rendering.
const { data: mfaEnabled = false } = useMfaStatus();      // SET-3
const { data: hooks, isLoading } = useWebhooks();          // SET-4 — isError dropped
```

Two shapes of the same bug, both shipped:

- **The default read as fact.** The security panel opened claiming *Disabled* with a Set-up
  button while the status was still loading, then flipped — and said the same thing forever when
  the read failed, with no error at all. A security posture the app never read is the worst
  possible thing to assert.
- **Every branch falling through.** With `isError` unread, a failed fetch leaves `data`
  `undefined`: `isLoading` is false, `data && data.length === 0` is false, `data && length > 0`
  is false. The section renders a bare heading, and "we couldn't ask" reads as "there are none".

The house answer, in order of preference:

1. `QueryBoundary` — skeleton, retry, data, in one wrapper.
2. Explicit branches: `isPending` → skeleton **shaped like the thing** (a badge-sized skeleton
   for a badge), `isError` → `RetryError` with `onRetry={refetch}` and `isRetrying={isFetching}`,
   then the data.
3. For a derived summary built from *several* queries (a score, a total, a status line), require
   **all** of them to have landed. Rendering it from partial data invents a number.

- **An empty state is a claim too.** "No webhooks", "No passkeys registered", "0 members" must
  only render on a successful read.
- **Test all three states.** A test that only mocks `{ data }` is how both of these shipped —
  mock the query the way the component reads it, and assert what the user is told while pending
  and while failed.

## 9. A `catch` wraps only the step whose failure it describes

**Rule: once a write has succeeded, nothing after it may report itself as that write failing.**
A `try` that spans "create it" *and* "then go there" cannot tell the two apart — and the message
it picks decides what the user does next.

```tsx
// WRONG — one catch over create + hydrate + switch + invalidate + navigate.
try {
  const org = await createOrganization(input);
  await hydrateSessionContext();
  await switchToOrganization(org.id);
  await navigate(dashboard(org.slug));
} catch {
  notify.error(t(KEYS.formCheck)); // "Check the form" — for a form that was fine
}
```

The organization existed. The user was told their *form* was wrong, corrected nothing, submitted
again — and got a second organization (SET-6). The catch turned a navigation blip into a
duplicate write.

```tsx
let org;
try {
  org = await createOrganization(input);
} catch (error) {
  notify.error(mapApiError(error)); // the real reason; the user can fix this
  return;                            // and the dialog stays open on purpose
}

// The write LANDED. Close the retry surface before anything else can fail.
reset();
setOpen(false);
notify.success(t(KEYS.created, { name: org.name }));

try {
  await hydrateSessionContext();
  await switchToOrganization(org.id);
  await navigate(dashboard(org.slug));
} catch {
  notify.warning(t(KEYS.createdSwitchFailed, { name: org.name }));
}
```

- **Close the form the moment the write succeeds.** A dialog left open after a successful create
  is a retry button for something already done.
- **Surface the mapped error, not a category.** `mapApiError(error)` names the taken slug; "check
  the form" sends the user hunting for a mistake that isn't there.
- **Every follow-up step reports itself.** "Created, but we couldn't open it — pick it from the
  switcher" is recoverable in one click. A generic failure is recoverable only by guessing.
- **Test the count, not the toast.** `expect(createOrganization).toHaveBeenCalledTimes(1)` after a
  post-create failure is the assertion that fails on this bug.

## 10. A deferred action owns its optimism, its messages and its timer

**Rule: an undoable action is scheduled, not fired.** Everything the user sees must move at
*schedule* time, and the component that scheduled it must still own the timer.

Three failures, all in one five-second window (SET-7):

- **The optimism arrives late.** A mutation's `optimistic` / `optimisticInfinite` patch runs in
  `onMutate` — which is at the END of the undo window. The toast said "Removing Sam…" while Sam
  sat in the table for five seconds. **Apply the change when you schedule**, snapshot for undo,
  and restore that snapshot on both undo AND commit-failure. The mutation's own rollback
  snapshots at commit time, when the row is already gone, so it can never put it back.
- **Two components each own a message.** The deferred toast says it, then the mutation's
  `successMessage` says it again five seconds later. **One owner:** suppress the mutation's toast
  on deferred paths and let the pending → processing → committed toasts share a single id, so
  sonner replaces rather than stacks (rule 7).
- **The timer outlives its owner.** A `setTimeout` left running against a torn-down component
  cannot commit — the write goes through that component's mutation observer, which React has
  already disposed — so a confirmed destructive action silently does not happen. **Cancel on
  unmount, restore the row, and say so.** Never leave a pending write with no surface.

```tsx
const scheduleRemoval = useDeferredRowRemoval<Member>(orgQueryKeys.members(orgId));
scheduleRemoval({
  id: member.id,
  pendingMessage: t(keys.removePending, { name: member.name }),
  committedMessage: t(keys.removed),          // the ONE closing message
  toastId: `remove-member-${member.id}`,      // unique per row
  commit: () => removeMember.mutateAsync(member.id), // await it: failure rolls back
});
```

- **Return the promise from `commit`.** Fire-and-forget `mutate()` gives the scheduler no way to
  know the write failed, so the optimistic removal can never be undone.
- **Test the window, not just the outcome.** Assert what the list shows one second in — "the row
  eventually disappears" passes on this bug.

## 11. A param change dims the list; it never blanks it

**Rule: search, sort and filter must not swap the rows for a skeleton.** Those values live in the
query key, so every keystroke starts a *new* query with no data: `isPending` flips true, the panel
renders its skeleton, the container's height collapses, and the page jumps — then it refills. On a
fast connection that is a strobe; on a slow one the user loses their place (X-2).

```tsx
// the hook keeps the previous answer on screen…
useInfiniteQuery({ queryKey, queryFn, placeholderData: keepPreviousData });

// …and the panel dims it rather than replacing it
<Card className={cn('…', listRefreshClass(list.isRefreshing))} aria-busy={list.isRefreshing}>
```

- **`isPending` must mean the FIRST load.** With `keepPreviousData` on, an existing
  `isPending → skeleton` branch becomes correct by itself — it stops firing per keystroke. Never
  gate a skeleton on `isFetching`.
- **Expose the placeholder state; don't infer it.** `useCursorList` returns `isRefreshing`
  (`isPlaceholderData`) so a panel never has to guess whether its rows match its inputs.
- **Dim and `aria-busy` together** — the same message for the eye and for assistive tech.
- **Test the frame in between.** Rerender with new params, resolve nothing, and assert the old rows
  are still there with `isPending === false`. "The list eventually shows the results" passes on this
  bug.

## 12. A failed fetch is loud unless silence was chosen on purpose

**Rule: use `useAppQuery` for every read.** It defaults `meta: { notifyOnError: true }`, mirroring
`useAppMutation`, so the `QueryCache` toasts the mapped error.

The cache has always been able to toast — it just needed the flag, and across every call site in
`src/` exactly zero of them set it. So a 500 on a list rendered the panel's *empty* state and
nothing else; the failure existed only in Sentry (X-3). Rule 8 is how a component tells the two
apart; this is the default that stops a component being the only thing standing between a failure
and silence.

```tsx
// quiet — and the reason is right there, at the call site
const sessions = useAppQuery({
  queryKey: sessionsQueryKey,
  queryFn: api.listSessions,
  // The panel renders an inline failure row for exactly this query.
  notifyOnError: false,
});
```

- **One surface per failure, picked deliberately.** Inline (`QueryBoundary`, `RetryError`, a
  boundary the query throws into) **or** the toast — not both, never neither.
- **Polling queries stay quiet.** A toast every 30s is worse than the inline state it duplicates.
- **`notifyOnError: false` needs a sentence next to it.** "Silent because X renders it" is a
  reviewable claim; a bare `false` is the old bug with extra steps.
- **Test the flag, not the toast.** Assert what the cache saw (`query.meta?.notifyOnError`), so the
  test survives a change of toast library.

## 13. An async helper returns its promise

**Rule: a helper that starts async work returns it.** A `void`-returning wrapper removes the
caller's only way to know when the work finished — and every busy state, spinner and disabled
button downstream is built on exactly that.

```tsx
// WRONG — the caller cannot wait for this.
const guard = useCallback((action: () => Promise<unknown>): void => {
  action().catch(handle);
}, []);
```

`ConfirmDialog` does `await onConfirm()` to hold its busy state and block dismissal. Handed a
`void` wrapper it resolved on the same tick: clicking **Disable** on 2FA made the dialog vanish
instantly, and the step-up prompt arrived afterwards with nothing on screen to attach it to
(SET-8).

```tsx
const guard = useCallback(
  async (action: () => Promise<unknown>, options?: GuardOptions): Promise<void> => {
    if (guardingRef.current) return;   // rule 1 — one gesture, one run
    guardingRef.current = true;
    setIsGuarding(true);
    try { await action(); }
    catch (error) { /* step-up opens the dialog; anything else goes to onError */ }
    finally { guardingRef.current = false; setIsGuarding(false); }
  }, []);
```

- **Expose the flag as well as the promise.** `isGuarding` lets plain buttons — not just
  dialogs — disable themselves for the round-trip.
- **Returning the promise is also where the single-flight guard belongs** (rule 1). A helper
  wrapping credential mutations is exactly where a double-click must be dropped.
- **`void` at the call site, never in the signature.** `void guard(...)` documents a deliberate
  fire-and-forget; a `void` return type takes that choice away from every caller.
- **Test that it does not resolve early.** Hold the action open, assert the caller's `.then` has
  not run, then release. "It eventually resolves" passes on this bug.

## 14. A form pre-fills once, not on every refetch

**Rule: `reset()` belongs on the success TRANSITION, keyed by the record — never on the data
itself.** A `useEffect` keyed on `query.data` re-runs on every refetch, and a refetch is not an
edit the user made.

```tsx
// WRONG — runs again on every new array identity, wiping what was typed.
useEffect(() => {
  if (role && rolePermissions.data) reset({ ...role, permissions: rolePermissions.data });
}, [role, rolePermissions.data, reset]);
```

The permissions query key is a **descendant of the roles prefix**, so every other role mutation
invalidates it. Editing one role while anything else touched roles threw away the in-progress
edit (SET-10).

```tsx
const hydratedFor = useRef<string | null>(null);
useEffect(() => {
  if (!role) { hydratedFor.current = null; return; }
  if (!rolePermissions.isSuccess || hydratedFor.current === role.id) return;
  hydratedFor.current = role.id;
  reset({ ...role, permissions: rolePermissions.data });
}, [role, rolePermissions.isSuccess, rolePermissions.data, reset]);
```

- **Check the key hierarchy before you invalidate.** `[...roles(orgId), 'permissions', id]` is
  matched by an invalidation of `roles(orgId)`. Nesting a detail key under a list prefix is
  convenient until a detail is being edited.
- **Gate the body on `isPending` too** (rule 8). A checklist rendered from a list row that omits
  permissions opens as "this role can do nothing", then ticks itself.
- **Never overwrite a field the user has set.** A "default the first option" effect must fill an
  *empty* field only — a refetch that reorders the list otherwise replaces a chosen value
  mid-session (SET-11).
- **Test the refetch, not the first paint.** Type, re-render with a fresh-identity payload, and
  assert the typing survived. "It pre-fills correctly" passes on this bug.

## 15. A live control is a promise to act

**Rule: if a control can be pressed, pressing it must do something — and the user must be able
to tell which one is working.** Rule 1's single-flight guard is a correctness net under the
click, not a substitute for the affordance above it: it JOINS a duplicate to the request already
running, which means the second press is accepted by the UI and then quietly discarded.

```tsx
// WRONG — the menu stays live through a 2s write.
<DropdownMenuRadioGroup value={member.role} onValueChange={(role) => updateRole.mutate({ role })}>
  {ROLES.map((role) => <DropdownMenuRadioItem key={role} value={role}>{role}</DropdownMenuRadioItem>)}
</DropdownMenuRadioGroup>
```

```tsx
const isWriting = updateRole.isPending || updateStatus.isPending;
// Radix fires onValueChange for the CHECKED item too — a re-pick is not a change.
if (isWriting || role === member.role) return;
// …and every item carries `disabled={isWriting}`.
```

- **A no-op is not a change.** Re-selecting the current value sent a PATCH and toasted "Role
  updated" for something that did not happen (SET-12). Compare against the current value first.
- **One pending flag per control, not per screen.** `disabled={mutation.isPending}` spread across
  a grid of plan buttons greys out all of them and spins none — the click reads as a freeze. Track
  *which* item is running (`pendingPlanId === plan.id`) and pass `isLoading` to that one only
  (SET-13).
- **A confirm dialog waits for its own request.** `AlertDialogAction` closes on click; without
  `event.preventDefault()`, `disabled={isPending}`, and closing in `onSuccess`, the outcome lands
  on a screen the dialog has already left. Block `onOpenChange` while the request runs, too.
- **Never `void` a promise that can reject.** A click handler owns its failure: catch inside, so
  the handler cannot leave an unhandled rejection and a half-finished write behind (SET-13).
- **A follow-up step after a successful write needs its own message.** The plan changed and the
  payment step 503'd — one shared `try` would have blamed the plan change; no `catch` at all left
  an `incomplete` subscription with no form and no explanation. See rule 9.

## 16. A screen's SHAPE waits for the query; it does not guess

**Rule: when a query decides which controls EXIST, render a skeleton until it answers.**
Rule 8 covers a value that has not loaded. This is the harder case: the answer decides the
navigation itself, and "allow everything until we know" paints a menu that is then deleted in
front of the user.

```ts
// WRONG — an unknown org type means "every section exists".
const allowed = (section) => !ctx.orgType || sectionsForOrgType(ctx.orgType).includes(section);
```

```tsx
const meContext = useMeContext();
const orgType = meContext.data?.activeOrganization?.type;
// `undefined` is "still loading", not "anything goes".
const contextReady = !meContext.isPending;
const active = parsed && contextReady ? resolve(parsed, ctx, fallback) : null;
if (!active) return <ShellWithSkeletonRail />;   // open, sized, and honest
```

- **A deep link is a claim too.** Resolving `#settings/organization/members` on a guess opened the
  members panel on a personal workspace and then swapped it for a fallback section (SET-15). Hold
  the hash; it still resolves once the context lands.
- **The skeleton keeps the shape.** Same width, same group rhythm, so nothing moves when the real
  rail replaces it — a modal that renders nothing is its own layout jump.
- **An error is not "still loading".** Gate on `isPending`, not on `data === undefined`: a failed
  fetch must fall back to whatever gating still works, never hang on the skeleton.
- **A permissive helper may keep being permissive — say who it is for.** The command palette
  prefers an extra row to a missing one; the modal must not render on that answer. When two callers
  want different answers to "unknown", the caller that paints structure is the one that waits.

## 17. A countdown is a deadline, and it owns exactly one timer

**Rule: derive the number from `Date.now()` against a stored deadline, and clear the running
timer before starting another.** A counter that subtracts one per tick is only correct while the
browser is willing to run your ticks — and a background tab is throttled to roughly one a minute.

```ts
// WRONG — the tab sleeps, the timer stacks, the number lies.
setCountdown(GRACE_SECONDS);
intervalRef.current = setInterval(() => setCountdown((prev) => prev - 1), 1000);
```

```ts
stopCountdown();                       // a second warn must not stack a second interval
const deadline = Date.now() + GRACE_MS;
intervalRef.current = setInterval(() => {
  const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  setCountdown(remaining);
  if (remaining === 0) stopCountdown();
}, 1000);
```

- **The number is a promise about when something happens.** A logout countdown that reads 1:29
  while 0:59 remains is worse than no countdown: the user budgets against it (SET-16).
- **A deadline is self-healing.** The next tick after the tab wakes up is correct, with no
  visibility listener and no resync code.
- **`start` clears before it starts.** A ref that gets overwritten leaks its timer for the tab's
  lifetime, and the two of them tick the same state down at double speed.
- **Test the timers, not the display.** Spy on `setInterval` / `clearInterval` and assert the pairs;
  then jump the clock with `setSystemTime` (or Playwright's `clock.setSystemTime`) WITHOUT firing
  the ticks — that is what a throttled tab actually does, and it is the only way this bug shows up.
- **A mount flag is re-armed on every run, not just the first.** `useEffect(() => () => {…}, [])`
  that only ever sets `false` leaves a Strict-Mode remount permanently "unmounted" to itself — set
  it to `true` at the top of the effect body (SET-17).

## 18. A list under a search dims; it never disappears

**Rule: hold the previous rows and mark them stale — from the keystroke, not from the request.**
Search and sort live in the query key, so every keystroke is a new query; a panel that renders a
skeleton whenever `isPending` is true blanks the list and collapses the container on each one.

```tsx
// The hook keeps the rows (once, for every list that uses it):
placeholderData: keepPreviousData,          // isPending now means "the FIRST load"
isRefreshing: query.isPlaceholderData,      // "these rows answer the previous params"

// The panel dims them — and starts dimming before the request does:
const { debounced, isPending } = useDebouncedSearch(search);
const stale = isListStale(list.isRefreshing, isPending);
<Card className={listRefreshClass(stale)} aria-busy={stale}>
```

- **The debounce window counts.** Between the keypress and the request there is a ~300ms hole where
  the list answers a question the user has already changed and says nothing about it (SET-19).
- **Fix it in the hook, not in the panel.** Three panels had the same bug because they shared one
  hook; the dim belongs to the panel, but the data policy belongs to `useCursorList`.
- **`aria-busy` alongside the dim**, so assistive tech hears what the opacity shows.
- **Measure the height, not just the rows.** The user-visible damage is the jump: idle 440px →
  in-flight 379px → settled 257px is three layouts for one keystroke.
- **A skeleton is still right for the first load** — there is nothing to keep. It is only wrong as
  an answer to "the parameters changed".

## 19. Four states, and the same three components every time

**Rule: a data surface renders loading, error, empty AND list — with `Skeleton`, `RetryError`
and `EmptyState`.** Rule 8 says all three query states must be rendered; this is the house's
answer to *how*, and it exists so two panels never answer the same failure differently.

```tsx
{query.isPending ? <Skeleton … /> : null}

{query.isError ? (
  <RetryError message="Couldn't load your sessions. Please try again."
              onRetry={() => void refetch()} isRetrying={isFetching} />
) : null}

{!(query.isPending || query.isError) && rows.length === 0 ? (
  <EmptyState icon={<Laptop />} title="No active sessions"
              description="Sessions appear here once you sign in on a device." />
) : null}
```

- **A sentence is not an error state.** Red text with no action means the only way to retry is to
  close the screen and open it again — measured: the sessions panel could not recover in place at
  all (SET-20).
- **Empty is a state, not the absence of one.** `rows.length > 0 && <List/>` with no `else` leaves
  the skeleton handing over to blank space, which reads as "still loading" (SET-21). A 69px panel
  is not an answer.
- **Consistency is the point.** The API-key list printed a sentence while the webhook list directly
  beneath it offered a retry — same screen, same failure, two different contracts.
- **Wire the retry to the query, and let it say it is working.** `RetryError` passes `isRetrying`
  into `Button isLoading`; TanStack Query de-dupes concurrent refetches of a key, so a double-click
  cannot start two.
- **Write the empty copy for a first-time user**, not for a developer: what belongs here, and how it
  gets here.

## 20. Every write goes through `useAppMutation` — including the generic ones

**Rule: `useMutation` appears in exactly one place, inside `useAppMutation`.** Everything a write
in this app is expected to do lives there: the synchronous single-flight guard, the error toast,
the optional success toast, optimistic rollback, and invalidation that does not hold `isPending`
open.

The documented CRUD hooks — `useCreate`, `useUpdate`, `useDelete` — were hand-rolled on raw
`useMutation` with none of it, and `CLAUDE.md` points new feature work straight at them. Nothing
was broken yet only because nothing used them; the first resource page built on them would have
inherited silent failures, no rollback, a double-clickable submit, and a spinner that outlasts the
write (X-4).

- **A shared hook is a promise about behaviour.** If it is in the docs as the way to do X, it has
  to carry the house behaviour for X, even while its call-site count is zero. Latent is not
  harmless; it is harm with a delay.
- **Do not `await invalidateQueries` in `onSuccess`.** It resolves when every active observer has
  finished refetching, and `isPending` stays true for all of it — so a button bound to `isPending`
  spins through the write *and* every list that depends on it. Fire it (`void`) and let each list
  show its own `isFetching`.
- **Wrap, don't fork.** A generic hook adds its resource wiring and forwards the rest
  (`successMessage`, `notifyOnError`, `onSuccess`) — it never re-implements them.

## 21. A disabled query is not a loading one

**Rule: `isPending` alone never decides that a spinner is correct.** In TanStack Query v5 a query
with `enabled: false` sits at `status: 'pending'` **forever**: no data, and nothing coming. A
component that branches on `isPending` renders a skeleton that can never resolve.

```tsx
// WRONG — a gated query parks here permanently
if (query.isPending) return <Skeleton />;

// RIGHT — 'idle' on a pending query means nothing is in flight
if (query.isPending && query.fetchStatus === 'idle') return <>{idle ?? null}</>;
if (query.isPending) return <Skeleton />;
```

- **Fix it in the shared component, not at the call site.** Two callers had already worked around
  `QueryBoundary` with a manual early return, which is how a shared component becomes a trap: the
  workaround is invisible to the next person, and the bug only shows up in their feature (X-5).
- **Give idle its own branch.** Rendering nothing is the usual right answer, but it must be a
  *decision* in the component, with a hook for callers that want to say "pick a plan first".
- **`enabled`-gated hooks are everywhere** — `useOne(id)` with no id yet, org-scoped lists before
  the org resolves, billing cards behind a subscription check. Assume any query you are handed
  might be disabled.
- **Test the disabled state explicitly.** `{ isPending: true, fetchStatus: 'idle' }` renders
  nothing; `{ isPending: true, fetchStatus: 'fetching' }` renders the skeleton. A test that only
  sets `isPending` passes on this bug.

## 22. A placeholder is the size and shape of what replaces it

Translation readiness is shared across startup, routes, and overlays: hydrated
preferences are not loaded copy. Cover a saved non-default language on cold boot,
navigation during a slow language switch, superseded switches, and failed chunks.
A failed or cancelled switch must release navigation waiters. Before resolving a
late namespace request, recheck the committed language and load its copy if the
language changed during the request. Keep deferred-promise regression tests for
both races; a successful switch alone does not exercise either failure mode.
Keep route-title labels eager. Deferred notification handoff must retain remaining
lifetime rather than restarting it; failed imports must not make finite toasts permanent.

**Keep the ready shell.** Settings, appearance, and search surfaces should open
with their available headings, navigation, close controls, and static settings.
Put skeletons only where dynamic content is unavailable, using the same geometry
as the resolved content. Do not replace the whole box because one section is
fetching, or replace existing data with a skeleton during refetch.

This does not authorize showing controls before authentication or permissions
resolve. Keep unknown privileged state non-interactive and clearly distinct from
a denied result. Likewise, await a visible section's translation namespace rather
than briefly rendering raw keys. A chunk failure needs contained, actionable
feedback while leaving the rest of the shell usable.

Verify both delayed success and failure in a production browser, including mobile
layout, keyboard focus, and the before/after content bounds. See the
`bundle-performance` skill for measuring actual startup work.

**Rule: build the loading state from the SAME shell as the loaded state, and hold the space of a
control you are still deciding about.** A placeholder that guesses a height moves the page when
the answer lands; a control rendered as nothing until permission resolves pops in a moment later.

```tsx
// WRONG — four 48px bars for rows that render ~108px each.
{['a','b','c','d'].map((k) => <Skeleton key={k} className="h-12 w-full" />)}

// RIGHT — one block per real category, in the row's own shell.
<div className="divide-y">
  {CATEGORIES.map((cat) => (
    <div key={cat.id} className="py-4 first:pt-0 last:pb-0">
      <Skeleton className="h-5 w-32" />   {/* the label's line box */}
      <Skeleton className="h-4 w-64" />   {/* the description's   */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">…</div>
    </div>
  ))}
</div>
```

- **Derive the skeleton from the same array and the same paddings** the rendered rows use. Then it
  cannot drift when the row grows a line: measured 435px → 590px (a 155px jump) before, 590 → 590
  after (SET-22).
- **`false` from a permission check is ambiguous.** Store whether the set is an ANSWER, and hold
  the slot with a disabled placeholder while it is not — the control appears where it will live,
  and cannot be clicked before the answer arrives (SET-23).
- **Clear, don't blank.** A guard that writes `setPermissions([])` to drop stale grants makes "we
  don't know" indistinguishable from "you may not"; give the store an explicit
  `clearPermissions()`.
- **Measure the jump, not the intent.** The panel's `boundingBox().height` before and after the
  data lands is the only number that settles this.

## 23. A cold entry is never a blank page

**Rule: `pendingMs` is a bet that there is something on screen worth keeping.** On an in-app
navigation there is — the current screen stays up and the progress bar reports the work, which is
why the default here is 3000 ms. On a **cold load** there is nothing: the boot splash fades after
first paint, the route is still in `beforeLoad`, and the user watches a blank page with a 2 px bar
for three seconds (X-6).

The answer is a **policy with two phases, not a list of routes**:

```tsx
// app/routes/routeTree.tsx
export const BOOT_PENDING_POLICY = { defaultPendingMs: 0, defaultPendingMinMs: 0 } as const;
export const IN_APP_PENDING_POLICY = { defaultPendingMs: 3000, defaultPendingMinMs: 500 } as const;

const unsubscribe = appRouter.subscribe('onResolved', () => {
  unsubscribe(); // fires only for the navigation that COMMITS — a `/` → `/login` redirect is one boot
  appRouter.update({ ...appRouter.options, ...IN_APP_PENDING_POLICY });
});
```

- **It used to be a per-route override, and the list was wrong.** `/`, the auth shell, `/onboarding`
  and `/organization` opted into `pendingMs: 0`, on the theory that those are "the routes a cold
  visit lands on". A cold visit lands just as often on a bookmarked dashboard or an emailed invite
  link — every one of which awaits `/auth/refresh` in `beforeLoad` and got the blank page. "Is
  anything on screen yet?" is a question about **time**, not about which route it is.
- **On boot the pending component is not a spinner, it is a hold.** `FullPageSpinner` renders nothing
  while the HTML splash is up and `holdAppSplash()`es it — so mounting it at once on every cold URL
  is what makes the boot one continuous screen.
- **The router's built-in `defaultPendingMinMs` is 500 ms, and it is counted from the moment the
  fallback renders.** It exists so a spinner cannot flash. On boot there is nothing to flash — the
  "spinner" is the splash the user is already looking at — so it simply parked every cold load for
  half a second: a guest's `/auth/refresh` was answered at ~130 ms and the login screen's chunks
  were not even *requested* until ~650 ms. Measured on a production build, guest `/` → login form
  went 879 → 384 ms from this alone plus the warm-up in §30. A minimum is only right once there is a
  real screen for a spinner to flash over, which is exactly the in-app phase.
- **The same half second sat in the hop after sign-in.** `/login` → `/` swapped the form for a
  full-page spinner immediately and then held it for the minimum. Under the in-app policy the form
  stays (busy) until the dashboard is ready.
- **A resolver route is still the worst case.** `component: () => null` plus a pending window means
  the page is *definitionally* blank for that whole window.
- **Test the policy in both directions, and the browser invariant.** Unit: a fresh `createAppRouter()`
  boots on `0/0`, flips to `3000/500` on the first `onResolved`, flips once, and no route overrides
  either option. Browser (`tests/e2e/boot-splash.e2e.test.ts`): the splash fades **exactly once** and
  the page is **never blank** behind it — with `/auth/refresh` held open for 1.5 s, because on
  localhost the guard answers faster than the splash can leave and the test passes against the bug.

## 24. A listener does not outlive the thing that installed it

**Rule: whatever installs a listener owns removing it — on the cancel path too, not just the happy
one.** `AbortController` makes that one line: pass `{ signal }` to `addEventListener`, abort it
wherever you tear down.

The refresh timer deferred its work when the tab was hidden by adding a `visibilitychange`
listener. `cancelTokenRefresh()` — which is what logout calls — cleared the timer id and nothing
else, so after logout the listener was still there: the next time the user focused the tab it ran a
refresh for a session that no longer exists. core-be rotates refresh sessions with **reuse
detection**, so that is not a harmless 401 — it is a session-killer. And one listener was added per
login/logout cycle, none ever removed (X-7).

```ts
let deferredAbort: AbortController | null = null;

deferredAbort = new AbortController();
document.addEventListener('visibilitychange', onVisible, { signal: deferredAbort.signal });

export function cancelTokenRefresh(): void {
  clearTimeout(timerId);
  deferredAbort?.abort();   // the half that was missing
  deferredAbort = null;
}
```

- **Cancel means cancel everything.** A teardown that clears one of two handles is worse than none:
  it reads as correct.
- **`visibilitychange` fires on hide as well as show.** Guard on `document.hidden` inside, or the
  deferred work runs at the wrong end.
- **Anything auth-shaped is a security bug, not a leak.** A stray listener that fires a network
  call is judged by what that call does to the session, not by the memory it holds.
- **Test the cancel path.** Defer, cancel, then dispatch the event and assert **nothing** happened —
  and loop it a few times to prove listeners are not stacking.
- **The mirror image: a flag the cleanup clears, the effect must set.** An "am I still mounted"
  ref (`aliveRef`, `isMountedRef`) guards the awaits of a long chain. Written as
  `useEffect(() => () => { aliveRef.current = false; }, [])` it is set by `useRef(true)` exactly
  once — and a ref **survives** React's Strict Mode remount (mount → cleanup → mount, in dev and so
  in every E2E run). After that simulated cleanup the component is permanently "gone" to itself:
  the invite accept finished, hit `if (!aliveRef.current) return`, and the card sat on
  "Accepting…" forever, with no success, no error and no redirect. Production never double-mounts,
  so it shipped. Set it in the effect body: `aliveRef.current = true; return () => { … = false }`.
  Three pages use the pattern; two already did this, with a comment saying why.

## 25. Per-row state belongs to the row

**Rule: a mutation that acts on ONE row is instantiated in that row, not on the list.** One
`useAppMutation` on the card means one `isPending` for every row — press delete on one and the
whole list goes grey.

```tsx
// WRONG — one flag, N rows.
const remove = useRemovePasskey();
rows.map((row) => <Button disabled={remove.isPending} onClick={() => remove.mutate(row.id)} />)

// RIGHT — the row owns its own mutation, and its own single-flight guard.
function PasskeyRow({ passkey }) {
  const remove = useRemovePasskey();
  return <Button isLoading={remove.isPending} onClick={() => remove.mutate(passkey.id)} />;
}
```

- **A per-row instance is what makes "leave the others enabled" safe.** `useAppMutation` JOINS a
  second call to the one in flight (rule 1), so sharing one instance across rows would turn a click
  on row B into a silent no-op. One instance per row keeps the guard where it belongs (SET-24).
- **Separate "an action is running" from "a ceremony is open."** A step-up dialog is a good reason
  to freeze sibling controls; a row that is simply saving is not — `useStepUpGuard` exposes
  `isGuarding` and `isSteppingUp` for exactly that split.
- **Say what failed, not what is convenient.** A failed SEND is not a wrong code: reusing the
  "that didn't match" copy answers a question the user has not been asked yet, and a "we emailed
  you" line rendered beside it is a claim the request just disproved (SET-25).
- **A message about a failure carries the way out** — the resend link sits next to the error, and
  it is single-flight so the retry cannot send two.

## 26. A form dialog holds every exit, and keeps its own failure

**Rule: while a form's write is in flight, the submit is not the only control that must be held —
Cancel, Esc and the overlay are exits too. And when the server rejects the form, the reason
belongs beside the field, not only in a toast.**

```tsx
<Dialog open={open} onOpenChange={(next) => { if (!create.isPending) setOpen(next); }}>
  …
  <Button variant="ghost" disabled={create.isPending}>Cancel</Button>
  <Button isLoading={create.isPending} onClick={submit}>
    {create.isPending ? 'Creating…' : 'Create webhook'}
  </Button>
```

```tsx
create.mutate(input, {
  onSuccess: close,
  // The dialog stays open on failure, so the reason goes IN it.
  onError: (cause) => setError(mapApiError(cause)),
});
```

- **Guarding submit is half the job.** Cancel used to stay live through the whole POST, so a user
  could leave with the write still running and nothing on screen to report it (SET-26).
- **An inline error slot that only holds zod messages is half an error surface.** The server knows
  things the schema cannot — "that URL already has a webhook" — and the user is looking at the
  field, not at the corner of the screen.
- **One failure, one place to read it.** When the dialog reports inline, the hook opts out of the
  default toast (`notifyOnError: false`) with a comment saying why — rule 12 wants silence chosen,
  not inherited.
- **Use the house error surface, not a local red sentence.** `FormError` — tinted card, icon,
  `role="alert"` — is what the user already met on the sign-in screen. A bare
  `<p className="text-destructive">` reads as a caption under the field rather than as the thing
  that went wrong, and re-inventing the styling per dialog means it drifts. Every inline form
  failure goes through the same component (SET-25, SET-26).

```tsx
// not: <p className="text-destructive text-xs">{error}</p>
<FormError message={error} data-testid="webhook-error" />
```
- **The busy state covers the whole job, not just the request.** A `FileReader` pass in front of a
  mutation is dead time the user can see: `isReading || update.isPending`, one "Uploading…" label
  across both halves, and the control disabled for both (SET-27). Name the label after the job the
  user asked for, not the internal step — nobody picked a file in order to have it *read*.

## 27. A gate on startup has a deadline

**Rule: any provider that renders `null` until something resolves owes the user a way out of that
`null`.** Two things have to be true, and the second is the one that gets forgotten:

1. It renders a **loader**, not nothing. The boot splash is dismissed after first paint, so an empty
   render is a white screen — no spinner, no error, nothing to click.
2. It gives up after a **deadline** and continues with a default.

```tsx
const [ready, setReady] = useState(() => store.persist.hasHydrated());

useEffect(() => {
  if (ready) return;
  const stop = store.persist.onFinishHydration(() => setReady(true));
  const deadline = window.setTimeout(() => setReady(true), HYDRATION_TIMEOUT_MS);
  return () => { stop(); window.clearTimeout(deadline); };
}, [ready]);

return <Provider>{ready ? children : <FullPageSpinner />}</Provider>;
```

- **"It cannot happen today" is the reason to handle it.** Locale hydration is synchronous against
  `localStorage`, so the gate always opens — until someone swaps in an async adapter, or a browser
  blocks storage. The failure mode is a white screen with no recovery path (X-8), and nothing about
  the swap would look risky.
- **Mount the provider, gate the children.** Keeping the context above the fallback means the
  loading state can still translate, and a child that renders during the wait is never handed a
  missing context.
- **Test the deadline, not just the happy path.** Never resolve the gate, advance the clock, and
  assert the children rendered anyway.

## 28. User-facing copy lives in the locale files — error screens included

**Rule: if a user can read it, it is a translation key.** Not just the happy path: the 403, the
suspended-organization screen, the theme menu, the panel headers. A locale switch that leaves half
the app in English is a half-translated product, and those screens are the ones a stressed user
reads most carefully (X-9).

- **The screens that get missed are the ones nobody demos.** Status and error pages, settings panel
  headers, dropdown item labels, `aria-label`s built from two hardcoded halves.
- **Module-level constants are the trap.** A `const CATEGORIES = [{ label: 'Billing' }]` at module
  scope is evaluated once, before any locale is chosen, and never re-renders. Hold **keys** in the
  constant and resolve them with `t()` at render.
- **A key lands in all eleven locales or it does not land.** `pnpm validate:i18n-parity` is the
  gate; an English string dropped into ten files is worse than the hardcoded one, because now it
  looks translated.
- **Match the key to the namespace the component already reads**, and pass `{ ns }` explicitly when
  it reads from another one — a key resolved against the wrong namespace renders as the raw key.

## 29. A global listener never answers the prompt it raised

**Rule: a listener on `document` sees every press — including the ones aimed at the dialog it just
opened.** If that listener's job is to decide "the user is back", then the user reaching for the
dialog's own button *is* the user being back, and the dialog is dismissed by the very gesture that
was trying to answer it.

The idle timer listened for `mousedown`, `click`, `keydown` and `touchstart` on `document`, and any
of them during the warning ended it: `onActive()` closed the "Session expiring" dialog and restarted
the clock. So a press on **Sign out** ran `mousedown` → dialog closed → the `click` had nothing left
to land on. The button could not sign anybody out — by mouse, by touch, or by keyboard, where the
`Tab` that reaches the button counts too. It looked like it worked in every unit test, because the
dialog's suite mocked the timer and the timer's suite had no dialog: the bug lived *between* the two
modules.

```ts
function handleActivity() {
  // Warned: only an explicit choice may continue the session.
  if (isWarning) return;
  …
}

return { extend, stop }; // "Stay signed in" calls extend() — nothing else restarts the clock
```

- **Once a prompt is up, presence is no longer the question.** The question is *which answer*, and
  only the prompt's controls can give one. Suspend the global listener for as long as the prompt is
  open, and give the prompt an explicit way to say "continue" (`extend()`), because the side effect
  it used to rely on is gone.
- **The same shape hides elsewhere.** An outside-click dismiss that also fires for clicks inside a
  portalled child; a "close on any key" that eats the key meant for the input it contains; a
  scroll-to-dismiss on a sheet that scrolls.
- **Default focus is part of the answer.** Radix focuses the *first* tabbable element when there is
  no Cancel, and here that was **Sign out**: Space or Enter to wake the screen signed the user out.
  An unattended prompt focuses the option that loses nothing.
- **Test the gesture the way a browser delivers it.** `mousedown`, `mouseup` and `click` are separate
  tasks and React commits between them. Fired inside one `act()`, the click still finds a dialog a
  real browser had already unmounted — and the test passes against the bug. Give each half its own
  `act()` and re-query the element (`SessionTimeoutDialog.sign-out.test.tsx`), and prove it in a
  browser with a real `mouse.down()` … `mouse.up()` (`tests/e2e/session-timeout.e2e.test.ts`).
- **Prove the test bites.** Put the old line back and watch it fail; a green test you never saw red
  is how this shipped.

## 30. A hint warms; it never decides — and work that needs no answer starts before the answer

**Rule: if a step does not depend on a response, it must not wait for the response.** Every entry
route awaits `/auth/refresh` in `beforeLoad`, and the router loads no component until that resolves
— so the destination's chunks were requested only *after* the network had answered: guard, **then**
route chunks, **then** (for the layouts) a variant chunk after the layout had mounted. None of that
waterfall depends on the answer.

```ts
// main.tsx — alongside startAuthBootstrap(), not after it
preloadBootRoutes({ likelySignedIn: hasSessionHint() });
```

- **The hint picks a side to warm; the guards still decide where the user lands.** `hasSessionHint()`
  is "this browser was signed in the last time we looked" — a localStorage timestamp, written on
  interactive sign-in and removed on logout. It may be wrong in both directions, and the only cost of
  being wrong is a few idle kilobytes. **Nothing may authorize on it**: the refresh cookie is HttpOnly
  and the server alone knows whether the session is alive. A hint that skipped the refresh call would
  break every session the hint does not know about (cleared storage, a parent-domain cookie).
- **Warm the level below, too.** A layout that lazy-loads its variant *after mounting* adds a round
  trip the router's preloader cannot see. Fetch it from the route `loader` — after `beforeLoad` has
  put `me/context` in the store, so the choice is exact, not a guess — and the layout finds it in
  memory (`preloadSessionAppShell()`, `preloadAuthLayoutVariant()`).
- **Speculation swallows its failures.** A rejected warm-up is not an error: the router loads the same
  chunk again through the normal path, where a failure has a boundary and a Retry. (`onceAsync` does
  not cache a rejection, so the retry really refetches.)
- **It must not cost the entry chunk what it saves.** The route tree *is* the entry chunk. Import the
  loaders dynamically from the functions that use them; a static import of two tiny modules was
  enough to break the initial-JS budget. See `bundle-performance` → "the root route's barrels".
- **A splash leaves on a signal, not on a guess.** `EXIT_GRACE_MS` (250 ms) is a guess about the
  future — "another loader may be about to mount" — and it is only right while a navigation is in
  flight. Once the router has resolved, the splash goes on the next frames
  (`markAppContentSettled()`); a new navigation puts the conservative window back
  (`markAppContentPending()`), which is the OAuth-callback handoff it was measured on.

## 31. A fallback that gets written down waits for every answer

**Rule: a decision that is PERSISTED — a canonicalized URL, a redirect, a stored preference, a form
reset — may only be made when every input it reads is an answer. "Not known yet" written down
becomes "no", permanently.**

§22 already says a `false` from a permission check is ambiguous and gives the store a way to say so
(`permissionsResolved`, `clearPermissions()`). That protects anything that merely *renders* from the
value: it flickers, then corrects itself. It does nothing for a consumer that **writes the wrong
answer back**, because that one never gets a second look.

The settings modal resolved `#settings/organization/general` to a section, and when the section was
not available it wrote the fallback into the URL (`replace: true`) so the link would be canonical. Its
readiness test was `!meContext.isPending`. Measured in a browser:

```text
6817ms  NAV …#settings/organization/general             ← the deep link
6819ms  orgType=TEAM  perms=0   groups=[account]         ← unresolved, read as "no"
6838ms  NAV …#settings/account/profile                  ← written down, 19 ms later
6842ms  orgType=TEAM  perms=14  groups=[account, organization]
```

me/context was right the whole time. Entering an organization runs `ensurePermissionsFor()`, which
clears the permission set a beat before the real one lands; for that beat the list is `[]` and
`permissionsResolved` is `false`. The nav recovered on its own at 6842 ms — the URL never did.

```ts
const accessResolved = useAccessResolved();
const contextReady = !meContext.isPending && (accessResolved || !meContext.data);
```

- **Audit the writers, not the readers.** Grep for the places a derived value goes *back out* —
  `navigate({ replace: true })` in an effect, a guard's `redirect()`, `localStorage.setItem`,
  `form.reset(defaults)` — and for each, list every input and ask whether it can be "not yet". A
  renderer can afford to be early; a writer cannot.
- **Waiting needs an exit.** The permission set is *derived from* me/context, so when that settled
  without data no answer is ever coming: the modal does not wait then (`|| !meContext.data`), or it
  would sit on its skeleton forever. Every "wait for X" names the case where X cannot arrive.
- **Waiting is not allowing.** Once the set IS resolved and the section is genuinely out of reach,
  the fallback is written exactly as before. Test all three: unresolved → URL untouched; resolved
  yes → opens; resolved no → canonicalized (`SettingsModal.test.tsx`).
- **The hypothesis was wrong, and the measurement said so.** The ticket blamed stale me/context; a
  per-render log of the component's inputs showed `orgType: "TEAM"` and `perms: 0` in one line.
  Instrument the inputs before fixing the one you suspect.
- **A repeat-each run is the proof for a timing bug.** One green run of a race proves little:
  `--repeat-each=3 --retries=0` on the spec that reproduces it.

