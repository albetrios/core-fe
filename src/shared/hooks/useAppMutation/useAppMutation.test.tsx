import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { successMock, errorMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
}));
vi.mock('@/shared/notify/index.ts', () => ({
  notify: {
    success: successMock,
    error: errorMock,
    info: vi.fn(),
    warning: vi.fn(),
    promise: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { useAppMutation } from './useAppMutation.ts';

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useAppMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates keys, toasts success, and runs onSuccess', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useAppMutation({
          mutationFn: async (n: number) => n + 1,
          invalidateKeys: [['members']],
          successMessage: 'Saved',
          onSuccess,
        }),
      { wrapper: makeWrapper(client) },
    );

    await result.current.mutateAsync(1);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['members'] });
    expect(successMock).toHaveBeenCalledWith('Saved');
    expect(onSuccess).toHaveBeenCalledWith(2, 1);
    expect(errorMock).not.toHaveBeenCalled();
  });

  it('toasts the mapped error on failure', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(
      () =>
        useAppMutation({
          mutationFn: async () => {
            throw new Error('boom');
          },
        }),
      { wrapper: makeWrapper(client) },
    );

    await expect(result.current.mutateAsync()).rejects.toThrow('boom');
    expect(errorMock).toHaveBeenCalledWith('boom');
  });

  it('skips the error toast when notifyOnError is false', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(
      () =>
        useAppMutation({
          mutationFn: async () => {
            throw new Error('silent');
          },
          notifyOnError: false,
        }),
      { wrapper: makeWrapper(client) },
    );

    await expect(result.current.mutateAsync()).rejects.toThrow('silent');
    expect(errorMock).not.toHaveBeenCalled();
  });

  it('optimistically patches the cache and keeps the patch after success', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const key = ['items'];
    client.setQueryData(key, [{ id: 'a' }, { id: 'b' }]);
    const { result } = renderHook(
      () =>
        useAppMutation({
          mutationFn: async (id: string) => id,
          invalidateKeys: [key],
          optimistic: {
            queryKey: key,
            update: (previous: { id: string }[] | undefined, id) =>
              previous?.filter((item) => item.id !== id),
          },
        }),
      { wrapper: makeWrapper(client) },
    );

    await result.current.mutateAsync('a');

    expect(client.getQueryData(key)).toEqual([{ id: 'b' }]);
    expect(errorMock).not.toHaveBeenCalled();
  });

  it('rolls back the optimistic patch on error', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const key = ['items'];
    const initial = [{ id: 'a' }, { id: 'b' }];
    client.setQueryData(key, initial);
    const { result } = renderHook(
      () =>
        useAppMutation({
          mutationFn: async () => {
            throw new Error('nope');
          },
          optimistic: {
            queryKey: key,
            update: (previous: { id: string }[] | undefined, id: string) =>
              previous?.filter((item) => item.id !== id),
          },
        }),
      { wrapper: makeWrapper(client) },
    );

    await expect(result.current.mutateAsync('a')).rejects.toThrow('nope');

    expect(client.getQueryData(key)).toEqual(initial);
    expect(errorMock).toHaveBeenCalledWith('nope');
  });

  it('optimisticInfinite patches every page of matching infinite queries', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    // Two param-variants under the same prefix — both should be patched.
    const prefix = ['items'];
    const keyA = ['items', 'list', { q: '' }];
    const keyB = ['items', 'list', { q: 'x' }];
    const page = (rows: { id: string }[]) => ({ rows, next: null, hasMore: false });
    client.setQueryData(keyA, {
      pages: [page([{ id: 'a' }, { id: 'b' }])],
      pageParams: [undefined],
    });
    client.setQueryData(keyB, { pages: [page([{ id: 'a' }])], pageParams: [undefined] });

    const { result } = renderHook(
      () =>
        useAppMutation({
          mutationFn: async (id: string) => id,
          optimisticInfinite: {
            queryKey: prefix,
            update: (rows: { id: string }[], id: string) =>
              rows.filter((row) => row.id !== id),
          },
        }),
      { wrapper: makeWrapper(client) },
    );

    await result.current.mutateAsync('a');

    expect(
      (client.getQueryData(keyA) as { pages: { rows: { id: string }[] }[] }).pages[0]
        ?.rows,
    ).toEqual([{ id: 'b' }]);
    expect(
      (client.getQueryData(keyB) as { pages: { rows: { id: string }[] }[] }).pages[0]
        ?.rows,
    ).toEqual([]);
    expect(errorMock).not.toHaveBeenCalled();
  });

  it('rolls back the optimisticInfinite patch on error', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const key = ['items', 'list', { q: '' }];
    const initial = {
      pages: [{ rows: [{ id: 'a' }, { id: 'b' }], next: null, hasMore: false }],
      pageParams: [undefined],
    };
    client.setQueryData(key, initial);

    const { result } = renderHook(
      () =>
        useAppMutation({
          mutationFn: async () => {
            throw new Error('nope');
          },
          optimisticInfinite: {
            queryKey: ['items'],
            update: (rows: { id: string }[], id: string) =>
              rows.filter((row) => row.id !== id),
          },
        }),
      { wrapper: makeWrapper(client) },
    );

    await expect(result.current.mutateAsync('a')).rejects.toThrow('nope');

    expect(
      (client.getQueryData(key) as { pages: { rows: { id: string }[] }[] }).pages[0]
        ?.rows,
    ).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(errorMock).toHaveBeenCalledWith('nope');
  });

  // Double-submit protection. `disabled={isPending}` only takes effect after React
  // re-renders, so a second click in the same frame still reaches the handler — on
  // a checkout that is a second charge. The guard is a ref, so it holds synchronously.
  describe('single-flight guard', () => {
    it('does not start a second write when fired twice before the first settles', async () => {
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      let release: ((value: string) => void) | undefined;
      const mutationFn = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            release = resolve;
          }),
      );
      const { result } = renderHook(() => useAppMutation({ mutationFn }), {
        wrapper: makeWrapper(client),
      });

      // Both calls happen before any re-render — exactly the double-click window.
      const first = result.current.mutateAsync();
      const second = result.current.mutateAsync();

      // TanStack dispatches mutationFn asynchronously, so let it start before counting.
      await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));

      release?.('charged-once');
      // The duplicate joins the in-flight request instead of starting its own.
      await expect(first).resolves.toBe('charged-once');
      await expect(second).resolves.toBe('charged-once');
      expect(mutationFn).toHaveBeenCalledTimes(1);
    });

    it('guards the fire-and-forget mutate() path too', async () => {
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      let release: ((value: string) => void) | undefined;
      const mutationFn = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            release = resolve;
          }),
      );
      const { result } = renderHook(() => useAppMutation({ mutationFn }), {
        wrapper: makeWrapper(client),
      });

      act(() => {
        result.current.mutate();
        result.current.mutate();
        result.current.mutate();
      });

      await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
      await act(async () => {
        release?.('ok');
      });
      expect(mutationFn).toHaveBeenCalledTimes(1);
    });

    it('allows a genuine retry once the first attempt has settled', async () => {
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const mutationFn = vi.fn(async (n: number) => n + 1);
      const { result } = renderHook(() => useAppMutation({ mutationFn }), {
        wrapper: makeWrapper(client),
      });

      await result.current.mutateAsync(1);
      await result.current.mutateAsync(2);

      expect(mutationFn).toHaveBeenCalledTimes(2);
    });

    it('releases the guard after a failure so the user can try again', async () => {
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const mutationFn = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce('ok');
      const { result } = renderHook(
        () => useAppMutation({ mutationFn, notifyOnError: false }),
        { wrapper: makeWrapper(client) },
      );

      await expect(result.current.mutateAsync()).rejects.toThrow('network down');
      await expect(result.current.mutateAsync()).resolves.toBe('ok');
      expect(mutationFn).toHaveBeenCalledTimes(2);
    });

    it('keeps the rest of the TanStack mutation surface intact', async () => {
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const { result } = renderHook(
        () => useAppMutation({ mutationFn: async (n: number) => n + 1 }),
        { wrapper: makeWrapper(client) },
      );

      expect(result.current.isPending).toBe(false);
      expect(typeof result.current.reset).toBe('function');
      await act(async () => {
        await result.current.mutateAsync(1);
      });
      await vi.waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toBe(2);
      });
    });
  });

  // ── SET-2: a repeated confirmation replaces itself ─────────────────────────

  it('passes a stable toast id through to the success and error toasts', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(
      () =>
        useAppMutation({
          mutationFn: async (fail: boolean) => {
            if (fail) throw new Error('boom');
            return 'ok';
          },
          successMessage: 'Saved',
          toastId: 'prefs',
        }),
      { wrapper: makeWrapper(client) },
    );

    await result.current.mutateAsync(false);
    // Sonner replaces a toast that reuses an id, so four saves show one toast.
    expect(successMock).toHaveBeenCalledWith('Saved', { id: 'prefs' });

    await result.current.mutateAsync(true).catch(() => undefined);
    expect(errorMock).toHaveBeenCalledWith(expect.any(String), { id: 'prefs' });
  });

  it('omits the options argument entirely when no toast id is set', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(
      () =>
        useAppMutation({
          mutationFn: async () => 'ok',
          successMessage: 'Saved',
        }),
      { wrapper: makeWrapper(client) },
    );

    await result.current.mutateAsync(undefined as never);
    // Not `('Saved', undefined)` — a one-off write keeps the old call shape.
    expect(successMock).toHaveBeenCalledWith('Saved');
  });
});
