import { keepPreviousData, type QueryKey, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import type { ListPage } from '@/shared/api/fetch-list-page.ts';

/**
 * Normalized result of a cursor-paginated list: the accumulated rows plus a
 * flat control surface. Hides `useInfiniteQuery`'s `data.pages` shape from
 * consumers so panels (and their tests) stay declarative.
 */
export interface CursorListResult<T> {
  /** All rows fetched so far, flattened across pages. */
  rows: T[];
  isPending: boolean;
  isError: boolean;
  /** Any fetch in flight (initial load, refetch, or next page). */
  isFetching: boolean;
  /**
   * The rows on screen belong to the PREVIOUS params while the new ones load —
   * the cue for a subtle dim, never a skeleton swap. See {@link useCursorList}.
   */
  isRefreshing: boolean;
  /** Whether another page can be loaded. */
  hasNextPage: boolean;
  /** A `Load more` fetch is in flight. */
  isFetchingNextPage: boolean;
  /** Load the next keyset page (no-op when there is none). */
  fetchNextPage: () => void;
  /** Refetch from the first page (used by the error retry surface). */
  refetch: () => void;
}

/**
 * Wraps `useInfiniteQuery` for a core-be keyset list: seeds `after` from the
 * previous page's forward cursor and exposes a {@link CursorListResult}. Keyset
 * pagination is forward-only, so this surfaces `fetchNextPage`/`hasNextPage`
 * (a `Load more` affordance) rather than jump-to-page controls.
 *
 * **Search and sort live in the query key, so every keystroke is a new query.**
 * Without `placeholderData` that query starts empty: `isPending` flips true, the
 * panel swaps its rows for a skeleton, then swaps back — the list blanks and
 * refills on each keystroke, and the page jumps as its height collapses (X-2).
 * `keepPreviousData` holds the previous rows on screen instead, and
 * `isRefreshing` marks them as belonging to the old params so the panel can dim
 * them. `isPending` then means what it says: the very first load.
 *
 * A failed fetch **toasts by default** (`meta.notifyOnError`); a list that
 * renders its own inline error surface opts out with `notifyOnError: false`
 * rather than failing silently by accident (X-3).
 */
export function useCursorList<T>(args: {
  queryKey: QueryKey;
  queryFn: (after: string | undefined) => Promise<ListPage<T>>;
  enabled?: boolean;
  /** Toast the mapped error on failure (default: true). */
  notifyOnError?: boolean;
}): CursorListResult<T> {
  const query = useInfiniteQuery({
    queryKey: args.queryKey,
    queryFn: ({ pageParam }) => args.queryFn(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? (last.next ?? undefined) : undefined),
    placeholderData: keepPreviousData,
    meta: { notifyOnError: args.notifyOnError ?? true },
    ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
  });

  const { fetchNextPage } = query;
  const nextPageInFlight = useRef(false);

  /**
   * Single-flight `Load more`. `disabled={isFetchingNextPage}` is React state
   * and only lands a render later, so a double-click fires the handler twice and
   * appends the same page twice. The ref flips inside the first call
   * (agent-os/rules/fe-resilient-interactions.mdc section 1).
   */
  const loadNextPage = useCallback(() => {
    if (nextPageInFlight.current) return;
    nextPageInFlight.current = true;
    fetchNextPage()
      .catch(() => {
        // Errors surface through the query's own isError state; nothing to do.
      })
      .finally(() => {
        nextPageInFlight.current = false;
      });
  }, [fetchNextPage]);

  return {
    rows: query.data?.pages.flatMap((page) => page.rows) ?? [],
    isPending: query.isPending,
    isError: query.isError,
    isFetching: query.isFetching,
    isRefreshing: query.isPlaceholderData,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: loadNextPage,
    refetch: () => {
      query.refetch().catch(() => {
        // Errors surface through the query's own isError state; nothing to do.
      });
    },
  };
}
