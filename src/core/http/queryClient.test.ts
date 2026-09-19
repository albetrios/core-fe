import { describe, expect, it, vi } from 'vitest';

const { notifyQueryErrorMock } = vi.hoisted(() => ({ notifyQueryErrorMock: vi.fn() }));
vi.mock('@/shared/errors/errorHandler.ts', () => ({
  reportError: vi.fn(),
  notifyError: vi.fn(),
  notifyQueryError: notifyQueryErrorMock,
}));

vi.mock('@/core/http/fetch-client.ts', () => ({
  isUnauthorized: vi.fn((error: unknown) => {
    return (
      error instanceof Error &&
      'status' in error &&
      (error as { status: number }).status === 401
    );
  }),
}));

import { reportError } from '@/shared/errors/errorHandler.ts';

import { queryClient } from './queryClient.ts';

/** A query object shaped the way the cache callback reads it. */
function fakeQuery(meta?: Record<string, unknown>) {
  return { queryKey: ['widget', 'data'], queryHash: 'wh', meta } as never;
}

describe('queryClient', () => {
  it('is a QueryClient instance', () => {
    expect(queryClient).toBeDefined();
    expect(queryClient.getDefaultOptions).toBeDefined();
  });

  it('query cache onError reports non-401 errors', () => {
    const onError = queryClient.getQueryCache().config.onError;
    const query = { queryKey: ['t'], queryHash: 't', meta: undefined } as never;
    onError?.(new Error('boom'), query);
    expect(reportError).toHaveBeenCalled();
  });

  it('mutation cache onError reports non-401 errors', () => {
    const onError = queryClient.getMutationCache().config.onError;
    const mutation = { options: { mutationKey: ['m'], meta: undefined } } as never;
    onError?.(new Error('boom'), undefined, undefined, mutation);
    expect(reportError).toHaveBeenCalled();
  });

  describe('the failure surface for a query that opts in (X-1 / X-3)', () => {
    it('stays quiet unless the query asked to be heard', () => {
      notifyQueryErrorMock.mockClear();
      const onError = queryClient.getQueryCache().config.onError;
      onError?.(new Error('boom'), fakeQuery());
      expect(notifyQueryErrorMock).not.toHaveBeenCalled();
    });

    it('toasts once per query, and the toast retries THAT query', () => {
      notifyQueryErrorMock.mockClear();
      const refetch = vi
        .spyOn(queryClient, 'refetchQueries')
        .mockResolvedValue(undefined);
      const onError = queryClient.getQueryCache().config.onError;

      onError?.(new Error('Service unavailable'), fakeQuery({ notifyOnError: true }));

      expect(notifyQueryErrorMock).toHaveBeenCalledTimes(1);
      const [error, opts] = notifyQueryErrorMock.mock.calls[0] as [
        Error,
        { id: string; onRetry: () => void },
      ];
      expect(error.message).toBe('Service unavailable');
      // De-duped per query, so several panels on one query share one toast.
      expect(opts.id).toBe('q:wh');

      // The Retry has to actually refetch — a toast that only closes itself is
      // the same silence with extra steps.
      opts.onRetry();
      expect(refetch).toHaveBeenCalledWith({ queryKey: ['widget', 'data'] });
      refetch.mockRestore();
    });

    it('says nothing for a 401 — the fetch client owns those', () => {
      notifyQueryErrorMock.mockClear();
      const unauthorized = Object.assign(new Error('nope'), { status: 401 });
      const onError = queryClient.getQueryCache().config.onError;
      onError?.(unauthorized, fakeQuery({ notifyOnError: true }));
      expect(notifyQueryErrorMock).not.toHaveBeenCalled();
    });
  });

  it('has staleTime configured', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(1000 * 60 * 5);
  });

  it('has refetchOnWindowFocus disabled', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
  });

  it('has mutations retry disabled', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.mutations?.retry).toBe(false);
  });

  it('retry function skips 401 errors', () => {
    const defaults = queryClient.getDefaultOptions();
    const retryFn = defaults.queries?.retry as (count: number, error: unknown) => boolean;
    expect(typeof retryFn).toBe('function');
  });
});
