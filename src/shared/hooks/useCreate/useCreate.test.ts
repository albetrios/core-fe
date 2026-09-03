import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataProvider } from '@/core/data-provider/dataProvider.ts';

const { notifyErrorMock } = vi.hoisted(() => ({ notifyErrorMock: vi.fn() }));
vi.mock('@/shared/notify/index.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const notify = actual.notify as Record<string, unknown>;
  return { ...actual, notify: { ...notify, error: notifyErrorMock } };
});

vi.mock('@/core/data-provider/index.ts', () => ({
  dataProvider: {
    getList: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } satisfies DataProvider,
}));

const { dataProvider } = await import('@/core/data-provider/index.ts');
const { useCreate } = await import('./useCreate.ts');

function makeContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('useCreate', () => {
  beforeEach(() => {
    vi.mocked(dataProvider.create).mockReset();
  });

  it('calls dataProvider.create with the resource and data', async () => {
    vi.mocked(dataProvider.create).mockResolvedValue({ id: 'u1', name: 'Alice' });
    const { wrapper } = makeContext();
    const { result } = renderHook(() => useCreate('users'), { wrapper });

    result.current.mutate({ name: 'Alice' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(dataProvider.create).toHaveBeenCalledWith('users', { name: 'Alice' });
  });

  it('invalidates the resource queries on success', async () => {
    vi.mocked(dataProvider.create).mockResolvedValue({ id: 'u1' });
    const { queryClient, wrapper } = makeContext();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreate('users'), { wrapper });
    result.current.mutate({ name: 'Alice' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(spy).toHaveBeenCalledWith({ queryKey: ['resource', 'users'] });
  });

  describe('what it inherits from useAppMutation (X-4)', () => {
    it('sends one POST for a double-clicked submit', async () => {
      // Two clicks in one frame: `disabled={isPending}` has not re-rendered yet,
      // so only the synchronous guard inside useAppMutation can stop the second.
      vi.mocked(dataProvider.create).mockResolvedValue({ id: 'u1' });
      const { wrapper } = makeContext();
      const { result } = renderHook(() => useCreate('users'), { wrapper });

      act(() => {
        result.current.mutate({ name: 'Alice' });
        result.current.mutate({ name: 'Alice' });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(dataProvider.create).toHaveBeenCalledTimes(1);
    });

    it('surfaces a failed write instead of swallowing it', async () => {
      notifyErrorMock.mockClear();
      vi.mocked(dataProvider.create).mockRejectedValue(new Error('nope'));
      const { wrapper } = makeContext();
      const { result } = renderHook(() => useCreate('users'), { wrapper });

      result.current.mutate({ name: 'Alice' });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(notifyErrorMock).toHaveBeenCalledTimes(1);
    });

    it('releases isPending when the write lands, not when the refetch does', async () => {
      // The old hooks awaited invalidateQueries inside onSuccess, so a submit
      // button bound to isPending stayed disabled through every dependent
      // refetch. This resolves the invalidation long after the write.
      vi.mocked(dataProvider.create).mockResolvedValue({ id: 'u1' });
      const { queryClient, wrapper } = makeContext();
      let releaseRefetch: () => void = () => undefined;
      vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            releaseRefetch = resolve;
          }),
      );

      const { result } = renderHook(() => useCreate('users'), { wrapper });
      result.current.mutate({ name: 'Alice' });

      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.isSuccess).toBe(true);
      releaseRefetch();
    });
  });
});
