import { type InfiniteData, type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { notify } from '@/shared/notify/index.ts';
import {
  type DeferredCommit,
  notifyDeferredCommit,
} from '@/shared/notify/notify-deferred.ts';

/** Minimal structural shape of one accumulated cursor-list page. */
type ListPage<TRow> = { rows: TRow[] };

/**
 * Where one row sat in ONE cached list variant, so undo can put that row — and
 * nothing else — back. Point 4 below is why this is not a whole-cache snapshot.
 */
interface RowSite<TRow> {
  /** The cached variant this site was read from. */
  key: QueryKey;
  /** Index of the accumulated page the row was on. */
  pageIndex: number;
  /** The row as it was cached at schedule time. */
  row: TRow;
  /** Ids that followed the row on that page — the anchor undo re-inserts before. */
  followerIds: Set<string>;
}

/** Drop one row from every accumulated page of a cursor list. */
function withoutRow<TRow extends { id: string }>(
  old: InfiniteData<ListPage<TRow>> | undefined,
  id: string,
): InfiniteData<ListPage<TRow>> | undefined {
  if (!(old && Array.isArray(old.pages))) return old;
  const dropId = (rows: TRow[]) => rows.filter((row) => row.id !== id);
  return {
    ...old,
    pages: old.pages.map((page) => ({ ...page, rows: dropId(page.rows) })),
  };
}

/** Record where `id` sits in every cached variant of the list, before removal. */
function sitesOf<TRow extends { id: string }>(
  entries: [QueryKey, InfiniteData<ListPage<TRow>> | undefined][],
  id: string,
): RowSite<TRow>[] {
  const sites: RowSite<TRow>[] = [];
  for (const [key, data] of entries) {
    if (!(data && Array.isArray(data.pages))) continue;
    data.pages.forEach((page, pageIndex) => {
      if (!Array.isArray(page.rows)) return;
      const row = page.rows.find((candidate) => candidate.id === id);
      if (!row) return;
      sites.push({
        key,
        pageIndex,
        row,
        followerIds: new Set(
          page.rows.slice(page.rows.indexOf(row) + 1).map((next) => next.id),
        ),
      });
    });
  }
  return sites;
}

/**
 * Put one recorded row back on its own page, touching no other row.
 *
 * It goes in just before its nearest surviving follower, so it lands where it
 * was even though the rows around it have since moved; when every follower has
 * gone (a refetch, or another removal still pending) it is appended instead.
 */
function withRow<TRow extends { id: string }>(
  old: InfiniteData<ListPage<TRow>> | undefined,
  site: RowSite<TRow>,
): InfiniteData<ListPage<TRow>> | undefined {
  // A variant the cache has since dropped stays dropped: returning `undefined`
  // makes `setQueryData` a no-op rather than resurrecting a whole stale list.
  if (!(old && Array.isArray(old.pages))) return old;
  const page = old.pages.at(site.pageIndex);
  if (!(page && Array.isArray(page.rows))) return old;
  // Idempotent — never duplicate a row the cache has already got back.
  if (page.rows.some((row) => row.id === site.row.id)) return old;

  const rows = [...page.rows];
  const follower = rows.findIndex((row) => site.followerIds.has(row.id));
  rows.splice(follower === -1 ? rows.length : follower, 0, site.row);
  return {
    ...old,
    pages: old.pages.map((candidate, index) =>
      index === site.pageIndex ? { ...candidate, rows } : candidate,
    ),
  };
}

export interface DeferredRowRemovalInput {
  /** Row id — used to filter the cached lists and to key the toast. */
  id: string;
  /** Undoable toast copy, e.g. "Removing Sam…". */
  pendingMessage: string;
  /** Closing toast once the write lands, e.g. "Member removed". */
  committedMessage?: string;
  /** Toast id; must be unique per row so two removals never fight. */
  toastId: string;
  /** The write itself. Return the promise so a failure can roll the row back. */
  commit: () => Promise<unknown>;
}

/**
 * Schedule a destructive row removal behind the shared undo toast — with the row
 * taken out of the list **immediately**.
 *
 * Four things this owns that the raw helper cannot (SET-7):
 *
 * 1. **The row leaves at schedule time, not at commit time.** The mutation's own
 *    `optimisticInfinite` patch runs in `onMutate`, which is five seconds away —
 *    so the toast said "Removing Sam…" while Sam sat in the table, untouched.
 *    The cached pages are patched here, and where the row sat is recorded so
 *    undo can put it back (point 4).
 * 2. **Undo and commit-failure both restore the row.** The mutation's own
 *    rollback snapshots at COMMIT time, when the row is already gone, so it
 *    cannot put it back; what is recorded here is the only thing that can.
 * 3. **Unmount cancels instead of leaking a timer.** Closing Settings inside the
 *    undo window used to leave a `setTimeout` pointed at a torn-down panel; it
 *    fired five seconds later and deleted the row from nowhere, with the undo
 *    affordance already gone. Committing at unmount instead is not the answer
 *    either — though NOT because the request would be stuck in the browser,
 *    which is what this comment used to claim. Under TanStack Query v5 the
 *    write does go out: the `Mutation` lives on the MutationCache, its
 *    `execute()` runs the `mutationFn` without ever consulting its observer
 *    list, and the mutation-level `onMutate`/`onSuccess`/`onError`/`onSettled`
 *    run with it. Unmounting only detaches the observer
 *    (`MutationObserver.onUnsubscribe` → `removeObserver`, which just schedules
 *    GC). What it DOES silently drop are the per-call callbacks handed to
 *    `mutate(vars, { onError })` — `MutationObserver` gates those behind
 *    `hasListeners()`. So committing here would fire a destructive write with
 *    its failure path muted and no undo left to press. The pending removal is
 *    CANCELLED instead — the row comes back and the user is told, rather than a
 *    confirmed delete silently happening (or silently not happening) after the
 *    surface is gone.
 * 4. **Undo is keyed per row, not per cache.** Removals overlap, so each
 *    schedule records only where ITS row sat and restores only that row. A
 *    whole-cache snapshot cannot: B's is captured while A is already out, so
 *    replaying it re-applies a list in which A is missing, and A stays missing
 *    until the list refetches. Per-row restores commute — any undo order, and
 *    the unmount loop's order, leave every restored row in place.
 *
 * @param queryKey Prefix matching every cached variant of the list (params are
 *   part of the key, so a single removal must patch them all).
 */
export function useDeferredRowRemoval<TRow extends { id: string }>(queryKey: QueryKey) {
  const queryClient = useQueryClient();
  /** Scheduled commits that have not settled yet, keyed by row id. */
  const pending = useRef(new Map<string, DeferredCommit>());

  useEffect(() => {
    const scheduled = pending.current;
    return () => {
      // Iteration order is irrelevant: each handle restores only its own row,
      // so cancelling overlapping removals in any order leaves them all back.
      for (const [rowId, commit] of scheduled) {
        // Only claim "undone" when this call really did cancel. `cancel()` is
        // inert once the commit is under way, and this toast carries a
        // different id from the commit's — so an unguarded call could sit
        // "Undone" beside that very write's confirmation.
        if (!commit.cancel()) continue;
        // Say so. A destructive action the user confirmed and then did not get
        // is exactly the thing that must never happen quietly.
        notify.info(i18n.t(ERRORS_KEYS.toast.undone, { ns: ERRORS_NS }), {
          id: `deferred-cancelled-${rowId}`,
        });
      }
      scheduled.clear();
    };
  }, []);

  return useCallback(
    (input: DeferredRowRemovalInput) => {
      const sites = sitesOf<TRow>(
        queryClient.getQueriesData<InfiniteData<ListPage<TRow>>>({ queryKey }),
        input.id,
      );
      queryClient.setQueriesData<InfiniteData<ListPage<TRow>>>({ queryKey }, (old) =>
        withoutRow(old, input.id),
      );

      const restore = () => {
        for (const site of sites)
          queryClient.setQueryData<InfiniteData<ListPage<TRow>>>(site.key, (old) =>
            withRow(old, site),
          );
      };
      const settle = () => pending.current.delete(input.id);

      const handle = notifyDeferredCommit({
        pendingMessage: input.pendingMessage,
        committedMessage: input.committedMessage,
        toastId: input.toastId,
        onCommit: async () => {
          settle();
          await input.commit();
        },
        onCancel: () => {
          settle();
          restore();
        },
        onCommitError: () => {
          restore();
        },
      });
      pending.current.set(input.id, handle);
    },
    [queryClient, queryKey],
  );
}
