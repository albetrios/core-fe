import {
  type InfiniteData,
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';

import { isStepUpRequiredError } from '@/shared/api/step-up-api.ts';
import { mapApiError } from '@/shared/errors/errorHandler.ts';
import { notify, type NotifyOptions } from '@/shared/notify/index.ts';

/**
 * Opt-in optimistic update: patch a cached list before the request resolves so
 * the UI reacts instantly, snapshot it for rollback on error, and let
 * `invalidateKeys` reconcile with server truth on success.
 */
export interface OptimisticConfig<TVars, TCache> {
  /** List query key whose cached value is patched optimistically. */
  queryKey: QueryKey;
  /** Compute the next cached value from the previous snapshot and the vars. */
  update: (previous: TCache | undefined, vars: TVars) => TCache | undefined;
}

/**
 * Optimistic update for a cursor-paginated `useInfiniteQuery` list. Because the
 * data lives under a param-scoped key (per search/sort), `queryKey` is a PREFIX
 * that matches every cached variant; `update` patches one accumulated page's
 * rows and is applied to every page of every match. Snapshots all matches for
 * rollback.
 */
export interface OptimisticInfiniteConfig<TVars, TRow> {
  /** Prefix key matching every cached param-variant of the infinite list. */
  queryKey: QueryKey;
  /** Patch one page's rows (applied to every page of every matched query). */
  update: (rows: TRow[], vars: TVars) => TRow[];
}

export interface AppMutationOptions<TData, TVars, TCache = unknown, TRow = unknown> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /**
   * Query keys to invalidate after a successful mutation. Fired, not awaited —
   * the refetch runs in the background and `isPending` ends with the write.
   */
  invalidateKeys?: QueryKey[];
  /** Success toast — a string or a fn of (data, vars). Omit for no toast. */
  successMessage?: string | ((data: TData, vars: TVars) => string);
  /** Toast the mapped error on failure (default: true). */
  notifyOnError?: boolean;
  /**
   * Stable toast id for this mutation's success / error toast. Sonner REPLACES a
   * toast that reuses an id instead of stacking a second one, so any mutation a
   * user can fire repeatedly in a few seconds — a preferences grid, a row of
   * switches, a list of toggles — should set one. Omit it for a one-off write
   * where each confirmation refers to a different thing.
   */
  toastId?: string | number;
  /** Extra success side effect (e.g. close a dialog). Runs once the write lands. */
  onSuccess?: (data: TData, vars: TVars) => void | Promise<void>;
  /** Optimistically patch a cached list; rolled back automatically on error. */
  optimistic?: OptimisticConfig<TVars, TCache>;
  /** Optimistically patch a cursor-paginated infinite list (prefix-matched). */
  optimisticInfinite?: OptimisticInfiniteConfig<TVars, TRow>;
}

/**
 * Toast options carrying the stable id, or NOTHING when none was given —
 * spreading an empty tuple keeps the single-argument call shape, so a mutation
 * without a `toastId` behaves exactly as before.
 */
function toastArgs(toastId: string | number | undefined): [NotifyOptions] | [] {
  return toastId === undefined ? [] : [{ id: toastId }];
}

/** Minimal structural shape of one accumulated infinite-list page. */
type InfiniteListPage<TRow> = { rows: TRow[] };

/** Rollback snapshot carried from `onMutate` to `onError`. */
type OptimisticContext =
  | { kind: 'single'; previous: unknown }
  | { kind: 'infinite'; snapshots: [QueryKey, unknown][] };

/**
 * The standard write mutation. Runs `mutationFn` (the fetch client auto-attaches
 * the `Idempotency-Key` on writes), invalidates the given query keys, and
 * surfaces a success / error toast through the single `notify` surface — so
 * every Phase 6–7 mutation behaves identically. Returns the TanStack mutation,
 * so callers still get `mutate` / `mutateAsync` / `isPending`.
 *
 * **Single-flight, by construction.** A second `mutate` / `mutateAsync` fired while
 * the first is still running does NOT start a second write — it joins the in-flight
 * promise. `disabled={isPending}` alone cannot guarantee this: `isPending` only
 * becomes true after React re-renders, so the button stays live for the frame after
 * the first click, and a double-click (or a bouncing/again-tapped touch target) can
 * fire the handler twice before the disable lands. On a checkout that is a second
 * charge. The guard here is a ref, so it flips synchronously inside the first call.
 * Keep using `disabled={isPending}` for the visible affordance — this is the
 * correctness net underneath it.
 */
export function useAppMutation<
  TData = unknown,
  TVars = void,
  TCache = unknown,
  TRow = unknown,
>(options: AppMutationOptions<TData, TVars, TCache, TRow>) {
  const queryClient = useQueryClient();
  const { optimistic, optimisticInfinite } = options;
  const inFlightRef = useRef<Promise<TData> | null>(null);
  const mutation = useMutation<TData, Error, TVars, OptimisticContext | undefined>({
    mutationFn: options.mutationFn,
    onMutate: async (vars) => {
      if (optimisticInfinite) {
        // Cancel in-flight refetches so they can't clobber the optimistic patch.
        await queryClient.cancelQueries({ queryKey: optimisticInfinite.queryKey });
        const snapshots = queryClient.getQueriesData({
          queryKey: optimisticInfinite.queryKey,
        });
        queryClient.setQueriesData<InfiniteData<InfiniteListPage<TRow>>>(
          { queryKey: optimisticInfinite.queryKey },
          (old) =>
            old && Array.isArray(old.pages)
              ? {
                  ...old,
                  pages: old.pages.map((page) => ({
                    ...page,
                    rows: optimisticInfinite.update(page.rows, vars),
                  })),
                }
              : old,
        );
        return { kind: 'infinite', snapshots };
      }
      if (optimistic) {
        await queryClient.cancelQueries({ queryKey: optimistic.queryKey });
        const previous = queryClient.getQueryData(optimistic.queryKey);
        queryClient.setQueryData<TCache>(optimistic.queryKey, (old) =>
          optimistic.update(old, vars),
        );
        return { kind: 'single', previous };
      }
      return undefined;
    },
    onSuccess: async (data, vars) => {
      // Marked stale synchronously, refetched in the background. Awaiting
      // `invalidateQueries` waits for every active observer to finish refetching
      // — and `isPending` stays true for all of it, so a button bound to it
      // spins through the write AND every list that depends on it. The lists
      // have their own `isFetching`; the button's job ended with the write (X-4).
      for (const queryKey of options.invalidateKeys ?? []) {
        void queryClient.invalidateQueries({ queryKey });
      }
      if (options.successMessage !== undefined) {
        notify.success(
          typeof options.successMessage === 'function'
            ? options.successMessage(data, vars)
            : options.successMessage,
          ...toastArgs(options.toastId),
        );
      }
      await options.onSuccess?.(data, vars);
    },
    onError: (error, _vars, context) => {
      // Restore the pre-mutation snapshot(s) before surfacing the error.
      if (context?.kind === 'infinite') {
        for (const [key, data] of context.snapshots) {
          queryClient.setQueryData(key, data);
        }
      } else if (context?.kind === 'single' && optimistic) {
        queryClient.setQueryData(optimistic.queryKey, context.previous);
      }
      // Step-up-required is a flow signal, not a user-facing failure — the
      // caller opens the StepUpDialog and retries, so a toast would be noise.
      if (options.notifyOnError !== false && !isStepUpRequiredError(error)) {
        notify.error(mapApiError(error), ...toastArgs(options.toastId));
      }
    },
  });

  const { mutateAsync } = mutation;

  const guardedMutateAsync = useCallback<typeof mutateAsync>(
    (vars, mutateOptions) => {
      // A duplicate submit joins the request already in flight rather than
      // starting a second one, so callers awaiting it still get a result.
      const inFlight = inFlightRef.current;
      if (inFlight) return inFlight;

      const promise = mutateAsync(vars, mutateOptions).finally(() => {
        inFlightRef.current = null;
      });
      inFlightRef.current = promise;
      return promise;
    },
    [mutateAsync],
  );

  const guardedMutate = useCallback<typeof mutation.mutate>(
    (vars, mutateOptions) => {
      // `mutate` never throws — failures surface through onError / the toast.
      void guardedMutateAsync(vars, mutateOptions).catch(() => undefined);
    },
    [guardedMutateAsync],
  );

  return useMemo(
    () => ({ ...mutation, mutate: guardedMutate, mutateAsync: guardedMutateAsync }),
    [mutation, guardedMutate, guardedMutateAsync],
  );
}
