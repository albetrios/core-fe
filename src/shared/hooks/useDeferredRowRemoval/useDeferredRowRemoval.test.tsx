import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeferredRowRemoval } from './useDeferredRowRemoval.ts';

const { notifyDeferredCommit } = vi.hoisted(() => ({ notifyDeferredCommit: vi.fn() }));
vi.mock('@/shared/notify/notify-deferred.ts', () => ({ notifyDeferredCommit }));

const notifyInfo = vi.hoisted(() => vi.fn());
vi.mock('@/shared/notify/index.ts', () => ({
  notify: { info: notifyInfo, success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

interface Row {
  id: string;
  name: string;
}
const QUERY_KEY = ['org', 'org_1', 'members'] as const;
const LIST_KEY = [...QUERY_KEY, 'list', { q: '' }] as const;

/** The captured callbacks of the most recent schedule. */
type Captured = {
  onCommit: () => Promise<void>;
  onCancel: () => void;
  onCommitError: (error: unknown) => void;
};
const captured = () => notifyDeferredCommit.mock.calls.at(-1)?.[0] as Captured;

function makeClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(LIST_KEY, {
    pageParams: [undefined],
    pages: [
      {
        rows: [
          { id: 'a', name: 'Ada' },
          { id: 'b', name: 'Bob' },
        ],
      },
    ],
  });
  return client;
}

function setup() {
  const client = makeClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useDeferredRowRemoval<Row>(QUERY_KEY), { wrapper });
  return { client, view };
}

const rowIds = (client: QueryClient) =>
  (
    client.getQueryData(LIST_KEY) as { pages: { rows: Row[] }[] } | undefined
  )?.pages.flatMap((page) => page.rows.map((row) => row.id)) ?? [];

describe('useDeferredRowRemoval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifyDeferredCommit.mockReturnValue({ cancel: vi.fn(), flush: vi.fn() });
  });

  it('takes the row out of the list at SCHEDULE time, not at commit time', () => {
    // SET-7: the mutation's own optimistic patch runs in onMutate — five seconds
    // later — so the toast said "Removing Ada…" while Ada sat in the table.
    const { client, view } = setup();

    act(() => {
      view.result.current({
        id: 'a',
        pendingMessage: 'Removing Ada…',
        toastId: 'remove-a',
        commit: () => Promise.resolve(),
      });
    });

    expect(rowIds(client)).toEqual(['b']);
    // The write itself has NOT run yet — the undo window is still open.
    expect(captured().onCommit).toBeTypeOf('function');
  });

  it('puts the row back when the user undoes', () => {
    const { client, view } = setup();
    act(() => {
      view.result.current({
        id: 'a',
        pendingMessage: 'Removing Ada…',
        toastId: 'remove-a',
        commit: () => Promise.resolve(),
      });
    });
    expect(rowIds(client)).toEqual(['b']);

    act(() => captured().onCancel());

    expect(rowIds(client)).toEqual(['a', 'b']);
  });

  it('puts the row back when the write fails', () => {
    // The mutation's own rollback snapshots at COMMIT time, when the row is
    // already gone — this snapshot is the only one that can restore it.
    const { client, view } = setup();
    act(() => {
      view.result.current({
        id: 'a',
        pendingMessage: 'Removing Ada…',
        toastId: 'remove-a',
        commit: () => Promise.reject(new Error('nope')),
      });
    });

    act(() => captured().onCommitError(new Error('nope')));

    expect(rowIds(client)).toEqual(['a', 'b']);
  });

  it('cancels a still-pending removal when the owner unmounts, and says so', () => {
    // Closing Settings inside the undo window used to leave a setTimeout
    // pointed at a torn-down panel, firing five seconds later with no toast and
    // no way to undo. The pending removal is abandoned instead — visibly.
    const cancel = vi.fn();
    notifyDeferredCommit.mockReturnValue({ cancel, flush: vi.fn() });
    const { view } = setup();
    act(() => {
      view.result.current({
        id: 'a',
        pendingMessage: 'Removing Ada…',
        toastId: 'remove-a',
        commit: () => Promise.resolve(),
      });
    });

    view.unmount();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(notifyInfo).toHaveBeenCalledTimes(1);
  });

  it('does not cancel a removal that already settled', async () => {
    const cancel = vi.fn();
    notifyDeferredCommit.mockReturnValue({ cancel, flush: vi.fn() });
    const { view } = setup();
    act(() => {
      view.result.current({
        id: 'a',
        pendingMessage: 'Removing Ada…',
        toastId: 'remove-a',
        commit: () => Promise.resolve(),
      });
    });

    await act(async () => {
      await captured().onCommit();
    });
    view.unmount();

    expect(cancel).not.toHaveBeenCalled();
    expect(notifyInfo).not.toHaveBeenCalled();
  });
});
