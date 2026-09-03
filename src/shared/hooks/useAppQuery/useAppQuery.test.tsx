import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppQuery } from './useAppQuery.ts';

/** What the QueryCache saw on each failure — the flag the toast is gated on. */
let notified: unknown[];
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  notified = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    queryCache: new QueryCache({
      onError: (_error, query) => notified.push(query.meta?.notifyOnError),
    }),
  });
});

describe('useAppQuery', () => {
  it('returns data like useQuery', async () => {
    const { result } = renderHook(
      () => useAppQuery({ queryKey: ['ok'], queryFn: () => Promise.resolve('hi') }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBe('hi'));
  });

  it('marks a failure as toast-worthy by default (X-3)', async () => {
    // The cache only toasts when meta.notifyOnError is true, and every call site
    // in src/ used to omit it — so a failed list rendered as an empty one.
    const { result } = renderHook(
      () =>
        useAppQuery({
          queryKey: ['loud'],
          queryFn: () => Promise.reject(new Error('500')),
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notified).toEqual([true]);
  });

  it('lets a caller with its own error surface opt into silence', async () => {
    const { result } = renderHook(
      () =>
        useAppQuery({
          queryKey: ['quiet'],
          queryFn: () => Promise.reject(new Error('500')),
          notifyOnError: false,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notified).toEqual([false]);
  });

  it('passes the rest of the query options straight through', async () => {
    const queryFn = vi.fn(() => Promise.resolve('never'));
    renderHook(() => useAppQuery({ queryKey: ['off'], queryFn, enabled: false }), {
      wrapper,
    });
    expect(queryFn).not.toHaveBeenCalled();
  });
});
