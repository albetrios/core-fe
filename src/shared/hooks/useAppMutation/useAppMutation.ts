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
 * Text identity of one call's variables — depth-first, object keys emitted in
 * sorted order so `{ membershipId, role }` and `{ role, membershipId }` are
 * recognised as the same write. Throws for anything JSON cannot round-trip;
 * `variablesKey` turns that into "no identity".
 */
function serializeVars(value: unknown, path: Set<object>): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  // Narrowed on `value` itself rather than a `kind` alias: the alias hides the
  // narrowing from both TS and Sonar, which then reads `String(value)` as a
  // possible '[object Object]' (S6551).
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // function / symbol / bigint — no faithful text form.
  if (typeof value !== 'object') throw new TypeError(`unkeyable ${typeof value}`);
  return serializeObjectVars(value as object, path);
}

/** Arrays and objects, with cycle detection along the current path. */
function serializeObjectVars(value: object, path: Set<object>): string {
  if (path.has(value)) throw new TypeError('cyclic vars');
  // `toJSON` first, exactly as JSON.stringify does — otherwise every Date
  // serializes to the empty object that every other Date serializes to.
  const toJson = (value as { toJSON?: () => unknown }).toJSON;
  if (typeof toJson === 'function') return serializeVars(toJson.call(value), path);
  path.add(value);
  const body = Array.isArray(value)
    ? value.map((item) => serializeVars(item, path)).join(',')
    : plainEntries(value)
        .map(([key, item]) => `${JSON.stringify(key)}:${serializeVars(item, path)}`)
        .join(',');
  path.delete(value);
  return Array.isArray(value) ? `[${body}]` : `{${body}}`;
}

/**
 * Own entries of a PLAIN object, key-sorted, `undefined` values dropped (they
 * never reach the wire either). A Map, a Set or a class instance keeps none of
 * its state in `Object.entries`, so it is rejected rather than flattened to
 * `{}` — flattened, every one of them would answer to the same key.
 */
function plainEntries(value: object): [string, unknown][] {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('non-plain vars');
  }
  return Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
}

/**
 * The single-flight latch key: two calls share one request only when their
 * variables are identical. `null` means the variables have no faithful text
 * form (a callback, a `Map`, a cycle) — such a call always starts its own
 * request, because guessing at its key is exactly how one write gets swallowed
 * by an unrelated one.
 */
function variablesKey(vars: unknown): string | null {
  try {
    return serializeVars(vars, new Set());
  } catch {
    return null;
  }
}

/** One-shot wrapper — a second invocation is ignored, so the callback runs once. */
function once<TArgs extends unknown[]>(
  callback: ((...args: TArgs) => void) | undefined,
): (...args: TArgs) => void {
  let spent = false;
  return (...args) => {
    if (spent) return;
    spent = true;
    callback?.(...args);
  };
}

/**
 * The standard write mutation. Runs `mutationFn` (the fetch client auto-attaches
 * the `Idempotency-Key` on writes), invalidates the given query keys, and
 * surfaces a success / error toast through the single `notify` surface — so
 * every Phase 6–7 mutation behaves identically. Returns the TanStack mutation,
 * so callers still get `mutate` / `mutateAsync` / `isPending`.
 *
 * **Single-flight per set of variables, by construction.** A second `mutate` /
 * `mutateAsync` fired with the SAME variables while the first is still running does
 * NOT start a second write — it joins the in-flight promise. `disabled={isPending}`
 * alone cannot guarantee this: `isPending` only becomes true after React re-renders,
 * so the button stays live for the frame after the first click, and a double-click
 * (or a bouncing/again-tapped touch target) can fire the handler twice before the
 * disable lands. On a checkout that is a second charge. The guard here is a ref, so
 * it flips synchronously inside the first call. Keep using `disabled={isPending}` for
 * the visible affordance — this is the correctness net underneath it.
 *
 * Calls with DIFFERENT variables are different writes and never join each other —
 * one hook instance serves every row of a list, and joining row B's delete to row
 * A's in-flight delete means B's request is never sent at all.
 */
export function useAppMutation<
  TData = unknown,
  TVars = void,
  TCache = unknown,
  TRow = unknown,
>(options: AppMutationOptions<TData, TVars, TCache, TRow>) {
  const queryClient = useQueryClient();
  const { optimistic, optimisticInfinite } = options;
  /** In-flight requests on this hook instance, keyed by their variables. */
  const inFlightRef = useRef(new Map<string, Promise<TData>>());
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
      //
      // Keyed on the VARIABLES, never on the hook instance. A settings panel
      // funnels every row's write through ONE instance, so an instance-wide
      // latch joined the removal of member B to the still-running removal of
      // member A: B's DELETE was never sent, B's per-call `mutateOptions` never
      // ran, and B's caller resolved with A's result — a success toast for a
      // member who is still in the organization. Same vars = the same write, so
      // join; different vars = a different write, so it gets its own request
      // and its own options. Vars with no stable key start their own request.
      const pending = inFlightRef.current;
      const key = variablesKey(vars);
      const inFlight = key === null ? undefined : pending.get(key);
      if (inFlight) return inFlight;

      // Bind this call's `mutateOptions` to THIS call. TanStack's mutation
      // observer keeps a single options slot and detaches from its previous
      // mutation as soon as a second one starts, so the moment two rows really
      // are in flight together it delivers only the LAST call's callbacks — the
      // first row's confirm dialog never closes, its busy flag never clears.
      // The observer still runs them (with its richer arguments) whenever it
      // can; these one-shot wrappers make the promise below a fallback for the
      // calls it abandons, never a second delivery.
      const calls = {
        onSuccess: once(mutateOptions?.onSuccess),
        onError: once(mutateOptions?.onError),
        onSettled: once(mutateOptions?.onSettled),
      };
      // What TanStack passes as the callbacks' last argument — this hook sets
      // neither `meta` nor a `mutationKey`.
      const callContext = { client: queryClient, meta: undefined };

      const promise = mutateAsync(vars, calls)
        .then((data) => {
          calls.onSuccess(data, vars, undefined, callContext);
          calls.onSettled(data, null, vars, undefined, callContext);
          return data;
        })
        .catch((error: unknown) => {
          calls.onError(error as Error, vars, undefined, callContext);
          calls.onSettled(undefined, error as Error, vars, undefined, callContext);
          throw error;
        })
        .finally(() => {
          // Identity-checked: only ever retire the entry this call put there.
          if (key !== null && pending.get(key) === promise) pending.delete(key);
        });
      if (key !== null) pending.set(key, promise);
      return promise;
    },
    [mutateAsync, queryClient],
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
