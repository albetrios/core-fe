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

/** Cached list variants captured before the row was taken out. */
type Snapshot = [QueryKey, unknown][];

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
 * Three things this owns that the raw helper cannot (SET-7):
 *
 * 1. **The row leaves at schedule time, not at commit time.** The mutation's own
 *    `optimisticInfinite` patch runs in `onMutate`, which is five seconds away —
 *    so the toast said "Removing Sam…" while Sam sat in the table, untouched.
 *    The cached pages are patched here and snapshotted for undo.
 * 2. **Undo and commit-failure both restore the snapshot.** The mutation's own
 *    rollback snapshots at COMMIT time, when the row is already gone, so it
 *    cannot put it back; this snapshot is the only one that can.
 * 3. **Unmount cancels instead of leaking a timer.** Closing Settings inside the
 *    undo window used to leave a `setTimeout` pointed at a torn-down panel; it
 *    fired five seconds later and deleted the row from nowhere, with the undo
 *    affordance already gone. Committing at unmount instead is not an option:
 *    the write runs through the panel's own mutation observer, which React has
 *    already torn down by the time an effect cleanup runs, so the request never
 *    leaves the browser. So the pending removal is CANCELLED — the row comes
 *    back and the user is told, rather than a confirmed delete silently
 *    happening (or silently not happening) after the surface is gone.
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
      for (const [rowId, commit] of scheduled) {
        commit.cancel();
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
      const snapshot: Snapshot = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData<InfiniteData<ListPage<TRow>>>({ queryKey }, (old) =>
        withoutRow(old, input.id),
      );

      const restore = () => {
        for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
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
