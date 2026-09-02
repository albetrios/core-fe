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

    // ── The latch keys on the VARIABLES, not on the hook instance ───────────
    // One panel-level hook serves every row, and each removal sits behind a ~5s
    // undo timer. Two confirmations a second apart flush while the first DELETE
    // is still open: an instance-wide latch handed row B row A's promise, so B's
    // request was never sent and B's caller saw A's success.

    it('joins a true duplicate — same vars, one request, both callers served', async () => {
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

      // Same write, spelled with the keys in a different order — still one write.
      const first = result.current.mutateAsync({ membershipId: 'm-1', role: 'admin' });
      const second = result.current.mutateAsync({ role: 'admin', membershipId: 'm-1' });

      await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));

      release?.('saved-once');
      await expect(first).resolves.toBe('saved-once');
      await expect(second).resolves.toBe('saved-once');
      expect(mutationFn).toHaveBeenCalledTimes(1);
    });

    it('sends one request per distinct vars, each with its own call options', async () => {
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const releases = new Map<string, (value: string) => void>();
      const mutationFn = vi.fn(
        (id: string) =>
          new Promise<string>((resolve) => {
            releases.set(id, resolve);
          }),
      );
      const { result } = renderHook(() => useAppMutation({ mutationFn }), {
        wrapper: makeWrapper(client),
      });

      const onRemovedA = vi.fn();
      const onRemovedB = vi.fn();
      // B's undo timer flushes while A's DELETE is still in flight.
      const first = result.current.mutateAsync('member-a', { onSuccess: onRemovedA });
      const second = result.current.mutateAsync('member-b', { onSuccess: onRemovedB });

      // Both DELETEs actually leave the browser — B is not swallowed by A.
      await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(2));
      expect(mutationFn.mock.calls.map(([id]) => id)).toEqual(['member-a', 'member-b']);

      releases.get('member-a')?.('removed-a');
      releases.get('member-b')?.('removed-b');
      // Each caller gets ITS result, not the other row's.
      await expect(first).resolves.toBe('removed-a');
      await expect(second).resolves.toBe('removed-b');
      // And each call's own options run, with its own data and its own vars.
      await vi.waitFor(() => {
        expect(onRemovedA.mock.calls.at(0)?.slice(0, 2)).toEqual([
          'removed-a',
          'member-a',
        ]);
        expect(onRemovedB.mock.calls.at(0)?.slice(0, 2)).toEqual([
          'removed-b',
          'member-b',
        ]);
      });
    });

    it('runs each call option exactly once on the ordinary single-call path', async () => {
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const onSuccess = vi.fn();
      const onSettled = vi.fn();
      const { result } = renderHook(
        () => useAppMutation({ mutationFn: async (id: string) => `${id}-done` }),
        { wrapper: makeWrapper(client) },
      );

      // Two delivery paths exist (the observer and the call's own promise), and
      // exactly one of them may reach the caller.
      await act(async () => {
        await result.current.mutateAsync('m-1', { onSuccess, onSettled });
      });

      await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(onSuccess.mock.calls[0]?.slice(0, 2)).toEqual(['m-1-done', 'm-1']);
    });

    it('still reports failure to the call that a later call superseded', async () => {
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const rejects = new Map<string, (reason: Error) => void>();
      const mutationFn = vi.fn(
        (id: string) =>
          new Promise<string>((_resolve, reject) => {
            rejects.set(id, reject);
          }),
      );
      const { result } = renderHook(
        () => useAppMutation({ mutationFn, notifyOnError: false }),
        { wrapper: makeWrapper(client) },
      );

      const onSettledA = vi.fn();
      const first = result.current.mutateAsync('item-a', { onSettled: onSettledA });
      const second = result.current.mutateAsync('item-b', { onSettled: vi.fn() });

      await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(2));
      rejects.get('item-a')?.(new Error('offline'));
      rejects.get('item-b')?.(new Error('offline'));
      await expect(first).rejects.toThrow('offline');
      await expect(second).rejects.toThrow('offline');

      // A row that unlocks itself in `onSettled` would stay locked forever
      // otherwise — the failure is the case where nothing else clears it.
      await vi.waitFor(() => expect(onSettledA).toHaveBeenCalledTimes(1));
      expect(onSettledA.mock.calls[0]?.[1]).toBeInstanceOf(Error);
      expect(onSettledA.mock.calls[0]?.[2]).toBe('item-a');
    });

    it('starts its own request when the vars have no stable key', async () => {
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const releases: ((value: string) => void)[] = [];
      const mutationFn = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            releases.push(resolve);
          }),
      );
      const { result } = renderHook(() => useAppMutation({ mutationFn }), {
        wrapper: makeWrapper(client),
      });

      // Two different callbacks serialize to the same nothing, so a content key
      // would join them — an unkeyable call always gets its own request instead.
      const first = result.current.mutateAsync({ id: 'x', onDone: () => 'a' });
      const second = result.current.mutateAsync({ id: 'x', onDone: () => 'b' });

      await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(2));
      releases[0]?.('one');
      releases[1]?.('two');
      await expect(first).resolves.toBe('one');
      await expect(second).resolves.toBe('two');
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
