# Data Mutations — Optimistic Updates & Write UX

How write mutations behave in core-fe: when a mutation patches the cache
**optimistically** (instant UI, auto-rollback) versus when it stays
**non-optimistic** (waits on the server and must show an **in-progress** state).

All write mutations go through `useAppMutation`
([`src/shared/hooks/useAppMutation`](../../src/shared/hooks/useAppMutation)), which
owns the toast + invalidation + optional optimistic patch in one place. Server
state is never mirrored into Zustand — TanStack Query is the single owner.

## Policy (what we follow going forward)

Every new write mutation picks exactly one of two modes:

| Mode               | Use when…                                                                                                                              | Requirement                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Optimistic**     | The change is a **safe in-place patch** of an already-cached list: a **removal** (filter by `id`) or a **field update** (map by `id`). | Use `useAppMutation`'s `optimistic` (single-key list) or `optimisticInfinite` (cursor-paginated list) config. Auto-rolls back on error. Reconciles via `invalidateKeys`. |
| **Non-optimistic** | **Creates** (need a temp id + server-id reconciliation), or any shape we can't safely guess.                                           | **Must surface an in-progress state** — wire `mutation.isPending` to a disabled button + spinner. Reconciles via `invalidateKeys`.                                       |

Rules that always hold:

- **Never leave a write with no feedback.** Optimistic = the row changes
  instantly; non-optimistic = the trigger shows `isPending`. One or the other.
- **Optimistic is for removals and field-patches only.** Do **not** optimistically
  insert created rows — the temp-id/real-id swap is error-prone (ghost/duplicate
  rows). Creates are non-optimistic + in-progress.
- **Errors always surface.** `useAppMutation` maps the error to a toast; optimistic
  mutations additionally restore the pre-mutation snapshot so the UI never lies
  after a failed write.
- **Reconcile, don't trust the guess.** Always pass `invalidateKeys` so the
  server's truth replaces the optimistic patch on success.

## The `optimistic` API

For a list cached under **one** key — the plain `useQuery` shape.

```ts
export function useRevokeSession() {
  return useAppMutation({
    mutationFn: (id: string) => api.revokeSession(id),
    invalidateKeys: [sessionsQueryKey],
    optimistic: {
      queryKey: sessionsQueryKey,
      // (previousCache, vars) => nextCache
      update: (previous: Session[] | undefined, id) =>
        previous?.filter((session) => session.id !== id),
    },
    successMessage: i18n.t(/* … */),
  });
}
```

Lifecycle: **cancel** in-flight refetches → **snapshot** the cache → **patch** it
→ on error **restore the snapshot** → on success **invalidate** to reconcile.

## The `optimisticInfinite` API — cursor-paginated lists

A `useCursorList` / `useInfiniteQuery` list does **not** live under one key: search and
sort are part of the key, so the same rows are cached once per param variant, and the
rows themselves sit inside `data.pages[].rows`. `optimistic` would patch one variant
and leave every other one still showing the row it just removed. `optimisticInfinite`
is the same idea with two differences — `queryKey` is a **prefix** matching every
cached variant, and `update` patches **one page's rows**, applied to every page of
every match:

```ts
export function useRevokeApiKey() {
  const orgId = useOrganizationStore((s) => s.organizationId);
  return useAppMutation({
    mutationFn: (keyId: string) => orgApi.revokeApiKey(keyId),
    invalidateKeys: [orgQueryKeys.apiKeys(orgId)],
    optimisticInfinite: {
      queryKey: orgQueryKeys.apiKeys(orgId),
      // (rowsOfOnePage, vars) => nextRows
      update: (rows: ApiKey[], keyId) => rows.filter((key) => key.id !== keyId),
    },
    successMessage: i18n.t(/* … */),
  });
}
```

Rollback snapshots **every matched variant**, not just one. The two configs are not
combined: `optimisticInfinite` is checked first, so a hook that sets both never
reaches the single-key path.

## Single-flight: one write per set of variables

`useAppMutation` wraps `mutate` / `mutateAsync` in a latch, so a second call fired with
the **same variables** while the first is still running joins the in-flight promise
instead of starting a second write. `disabled={isPending}` cannot guarantee that on its
own — `isPending` only becomes true after React re-renders, so the control stays live
for the frame after the first click. The latch is a ref, so it flips synchronously
inside the first call. Keep `disabled={isPending}` as the visible affordance; this is
the correctness net underneath it.

Three properties to know before relying on it:

- **The key is the serialized variables, never the hook instance.** One settings panel
  funnels every row's write through a single hook instance, so an instance-wide latch
  joined member B's removal to member A's still-running one — B's `DELETE` was never
  sent. Variables are serialized depth-first with object keys sorted, so
  `{ membershipId, role }` and `{ role, membershipId }` are recognised as one write.
- **Only true duplicates join.** Different variables are different writes and each gets
  its own request. Variables with no faithful text form (a callback, a `Map`, a `Set`, a
  class instance, a cycle) key to "no identity" and always start their own request —
  guessing at a key is exactly how one write gets swallowed by an unrelated one.
- **Each caller still gets its own callbacks.** What a duplicate joins is the
  **request**; the per-call `onSuccess` / `onError` / `onSettled` handed to
  `mutate(vars, { … })` still run, once each, off the joined promise. A row that clears
  a busy flag in `onSettled` would otherwise stay locked for the rest of the session
  after a double tap.

## Invalidation is fired, not awaited

`invalidateKeys` is dispatched in `onSuccess` without `await`: the keys are marked stale
synchronously and refetch in the background. Awaiting `invalidateQueries` would hold
`isPending` true until every active observer had finished refetching — so a button
bound to it spins through the write **and** every list that depends on it. The lists
have their own `isFetching`; the button's job ends with the write.

## In-progress for non-optimistic writes

Every mutation hook returns TanStack Query's `isPending`. Non-optimistic triggers
**must** consume it:

```tsx
<Button
  type="submit"
  disabled={inviteMember.isPending}
  isLoading={inviteMember.isPending}
>
  {inviteMember.isPending ? t('common.sending') : t('invite.send')}
</Button>
```

## Deferred removal with undo — `useDeferredRowRemoval`

Destructive row removals in the organization panels do not fire on confirm. They go
through [`useDeferredRowRemoval`](../../src/shared/hooks/useDeferredRowRemoval), which
drops the row from every cached variant of the list **immediately**, shows the shared
undo toast, and commits the write only once the 5s window closes. Both org panels use
it: `OrganizationMembersPanel` (remove member) and `OrganizationRolesPanel` (delete
role).

What it owns that the mutation's own `optimisticInfinite` patch cannot:

- **The row leaves at schedule time.** The mutation patches in `onMutate`, five seconds
  later — so the toast read "Removing Sam…" while Sam sat in the table, untouched.
- **Undo and a failed commit both restore the row.** The mutation snapshots at commit
  time, when the row is already gone; only the site recorded at schedule time can put
  it back.
- **Undo is keyed per row, not per cache.** Each schedule records where its own row sat
  (page index, plus the ids that followed it as a re-insert anchor) and restores only
  that row, so overlapping removals commute in any order.
- **Unmount cancels instead of committing.** Closing Settings inside the window cancels
  the pending write and says so, rather than leaving a timer pointed at a torn-down
  panel — or firing a destructive write whose per-call failure path is already muted.

Two call-site requirements: pass the mutation's `suppressSuccessToast` so one action
does not raise two success toasts five seconds apart (the undo toast owns the whole
sequence on one toast id, and takes the confirmation copy as `committedMessage`), and
`commit` must call **`mutateAsync`**, never `mutate` — `mutate` returns `void`, so
nothing is awaited, the toast reports success before the request lands, and a rejection
can never reach the rollback.

## Current inventory (snapshot — 2026-09-24)

**Optimistic** (instant, auto-rollback) — all safe removals + field-patches:

| Domain        | Mutation                                                          | Mode                             |
| ------------- | ----------------------------------------------------------------- | -------------------------------- |
| Roles         | `useUpdateRole`, `useDeleteRole`                                  | `optimisticInfinite`             |
| API keys      | `useRenameApiKey`, `useRevokeApiKey`                              | `optimisticInfinite`             |
| Members       | `useUpdateMemberRole`, `useUpdateMemberStatus`, `useRemoveMember` | `optimisticInfinite`             |
| Invitations   | `useRevokeInvitation` (patches the members list)                  | `optimisticInfinite`             |
| Sessions      | `useRevokeSession`                                                | `optimistic`                     |
| Passkeys      | `useRemovePasskey`                                                | `optimistic`                     |
| Webhooks      | `useDeleteWebhook`                                                | `optimistic`                     |
| Notifications | `useMarkNotificationRead`                                         | hand-rolled on raw `useMutation` |

The cursor-paginated panels (members, roles, API keys) are `optimisticInfinite`; the
single-key lists are `optimistic`. `useMarkNotificationRead` is the one write that does
**not** go through `useAppMutation` — it patches and rolls back the list and the unread
count by hand, so it has none of the shared toast, single-flight or rollback machinery
described above. `useRemoveMember`, `useRevokeInvitation` and `useDeleteRole` are additionally scheduled
behind the undo toast by their panels (see above), which is why all three take a
`suppressSuccessToast` option.

**Non-optimistic** (must show in-progress) — creates + shapes we can't safely patch:

- **Creates:** `useInviteMember`, `useCreateRole`, `useCreateApiKey`, `useCreateWebhook`, `useRegisterPasskey`
- `useResendInvitation` (core-be sets the new expiry), `useMarkAllNotificationsRead`, `useUpdateNotificationPreferences`, `useUpdateOrganization`, billing/MFA

> **Invitations ride on memberships.** core-be has no invitation list: an invite is
> created as an `INVITED` membership (`POST .../memberships`), so `useInviteMember` (a
> create — hence non-optimistic) refreshes the members list, and each invited row
> carries its live invitation (`invitation: { id, expires_at }`). Resend and cancel act
> on that id: `useResendInvitation` (`POST .../invitations/:id/resend`) and
> `useRevokeInvitation` (`DELETE .../invitations/:id`, which revokes the invitation
> **and** removes the invited membership). Cancel no longer goes through
> `useRemoveMember` — deleting the membership alone left the invitation unrevoked, so
> the invitee's link answered "not found" instead of "revoked". `useRemoveMember` stays
> the fallback for a caller holding `membership:manage` but not `invitation:manage`. See
> the docstrings in
> [`useInvitations.ts`](../../src/shared/hooks/useInvitations/useInvitations.ts).
>
> The inventory drifts as hooks are added — the **policy** above is the durable
> contract. When adding or changing a mutation, classify it and update this table.

## The read side — `useAppQuery`

Reads go through [`useAppQuery`](../../src/shared/hooks/useAppQuery) — `useQuery` with
this app's failure policy attached. **A failed fetch is loud by default.** The
`QueryCache` only toasts for a query that sets `meta.notifyOnError`, and across `src/`
exactly zero call sites set it: a 500 on a list left the panel rendering its _empty_
state, so "nothing here" and "we could not load this" looked identical. `useAppQuery`
defaults the flag on, which inverts that — silence is now opted into, in code, with a
reason beside it. The toast is de-duped per query hash, so a shared query several
panels mount still surfaces once.

Pass `notifyOnError: false` only when the failure is already visible in place (a
`QueryBoundary`, a `RetryError`, an inline failure row) and say so in a comment at the
call site. `useCursorList` takes the same flag for cursor-paginated lists, defaulted
the same way — which is the mirror of `useAppMutation`'s `notifyOnError`, so reads and
writes answer the same question the same way.

## Testing requirement

Optimistic mutations carry a real failure-mode risk: a broken rollback would leave
a failed write looking applied. So any optimistic path must be covered by:

1. **patch-kept-on-success** — the cache reflects the patch after the request resolves.
2. **rollback-on-error** — the cache returns to its exact pre-mutation state, and the error toast fires.

The shared mechanism is tested in
[`useAppMutation.test.tsx`](../../src/shared/hooks/useAppMutation/useAppMutation.test.tsx);
hook-specific cache shapes should be covered in the hook's own test.

## Related

- `agent-os/rules/api-data-patterns.mdc` — data-layer patterns (this is the canonical detail).
- `agent-os/skills/http-forms-errors/SKILL.md` — form mutation + error UX checklist.
- [`reference/frontend-platform.md`](frontend-platform.md) — platform kernel (queryClient defaults).
