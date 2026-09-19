import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListPage } from '@/shared/api/fetch-list-page.ts';

import { useCursorList } from './useCursorList.ts';

type Row = { id: string };

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

describe('useCursorList', () => {
  it('flattens the first page into rows and reflects hasNextPage', async () => {
    const queryFn = vi
      .fn<(after: string | undefined) => Promise<ListPage<Row>>>()
      .mockResolvedValue({
        rows: [{ id: 'a' }, { id: 'b' }],
        next: 'cur_1',
        hasMore: true,
      });

    const { result } = renderHook(
      () => useCursorList<Row>({ queryKey: ['list', 'a'], queryFn }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.current.hasNextPage).toBe(true);
    expect(queryFn).toHaveBeenCalledWith(undefined);
  });

  it('accumulates rows and passes the forward cursor as `after` on fetchNextPage', async () => {
    const queryFn = vi
      .fn<(after: string | undefined) => Promise<ListPage<Row>>>()
      .mockResolvedValueOnce({ rows: [{ id: 'a' }], next: 'cur_1', hasMore: true })
      .mockResolvedValueOnce({ rows: [{ id: 'b' }], next: null, hasMore: false });

    const { result } = renderHook(
      () => useCursorList<Row>({ queryKey: ['list', 'b'], queryFn }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    result.current.fetchNextPage();

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.current.hasNextPage).toBe(false);
    expect(queryFn).toHaveBeenNthCalledWith(2, 'cur_1');
  });

  it('keeps the previous rows on screen while new params load (X-2)', async () => {
    // search/sort live in the query key, so a keystroke is a whole new query.
    // Assigned synchronously by the Promise executor below.
    let resolveSecond!: (page: ListPage<Row>) => void;
    const queryFn = vi
      .fn<(after: string | undefined) => Promise<ListPage<Row>>>()
      .mockResolvedValueOnce({ rows: [{ id: 'a' }], next: null, hasMore: false })
      .mockImplementationOnce(
        () =>
          new Promise<ListPage<Row>>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useCursorList<Row>({ queryKey: ['list', 'search', q], queryFn }),
      { wrapper, initialProps: { q: '' } },
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    rerender({ q: 'ad' });

    // Without keepPreviousData this is the frame that blanks: rows empty,
    // isPending true, and the panel swaps the list for a skeleton.
    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.rows).toEqual([{ id: 'a' }]);
    expect(result.current.isPending).toBe(false);

    await act(async () => {
      resolveSecond({ rows: [{ id: 'ada' }], next: null, hasMore: false });
    });
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 'ada' }]));
    expect(result.current.isRefreshing).toBe(false);
  });

  it('sends one page request for a double-clicked Load more', async () => {
    const queryFn = vi
      .fn<(after: string | undefined) => Promise<ListPage<Row>>>()
      .mockResolvedValueOnce({ rows: [{ id: 'a' }], next: 'cur_1', hasMore: true })
      .mockResolvedValue({ rows: [{ id: 'b' }], next: null, hasMore: false });

    const { result } = renderHook(
      () => useCursorList<Row>({ queryKey: ['list', 'dbl'], queryFn }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    // Both clicks land in one frame — `disabled={isFetchingNextPage}` has not
    // re-rendered yet, so only the synchronous ref can stop the second fetch.
    act(() => {
      result.current.fetchNextPage();
      result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('toasts a failed fetch by default, and stays quiet only when asked (X-3)', async () => {
    const seen: unknown[] = [];
    client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
      queryCache: new QueryCache({
        onError: (_error, query) => seen.push(query.meta?.notifyOnError),
      }),
    });
    const queryFn = vi
      .fn<(after: string | undefined) => Promise<ListPage<Row>>>()
      .mockRejectedValue(new Error('500'));

    const { result } = renderHook(
      () => useCursorList<Row>({ queryKey: ['list', 'loud'], queryFn }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));

    const quiet = renderHook(
      () =>
        useCursorList<Row>({
          queryKey: ['list', 'quiet'],
          queryFn,
          notifyOnError: false,
        }),
      { wrapper },
    );
    await waitFor(() => expect(quiet.result.current.isError).toBe(true));

    expect(seen).toEqual([true, false]);
  });

  it('does not fetch when disabled', () => {
    const queryFn = vi
      .fn<(after: string | undefined) => Promise<ListPage<Row>>>()
      .mockResolvedValue({ rows: [], next: null, hasMore: false });

    renderHook(
      () => useCursorList<Row>({ queryKey: ['list', 'c'], queryFn, enabled: false }),
      { wrapper },
    );

    expect(queryFn).not.toHaveBeenCalled();
  });
});
