import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type DeferredRowRemovalInput,
  useDeferredRowRemoval,
} from './useDeferredRowRemoval.ts';

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
/** The captured callbacks of the Nth schedule, in call order. */
const capturedAt = (index: number) =>
  notifyDeferredCommit.mock.calls.at(index)?.[0] as Captured;

interface StubHandle {
  cancel: () => boolean;
  flush: () => void;
  /** Move to 'committing' the way a flush does, so `cancel()` goes inert. */
  beginCommit: () => void;
}

/**
 * Replace the inert default stub with one that models the real handle from
 * `notify-deferred.ts`: `cancel()` undoes and reports `true`, but is a no-op
 * reporting `false` once the commit has started. Returns the handles it hands
 * the hook, in creation order.
 */
function stubHandles(): StubHandle[] {
  const handles: StubHandle[] = [];
  notifyDeferredCommit.mockImplementation((options: Captured) => {
    let state: 'pending' | 'committing' | 'cancelled' = 'pending';
    const handle: StubHandle = {
      cancel: () => {
        if (state !== 'pending') return false;
        state = 'cancelled';
        options.onCancel();
        return true;
      },
      flush: vi.fn(),
      beginCommit: () => {
        state = 'committing';
      },
    };
    handles.push(handle);
    return handle;
  });
  return handles;
}

/** Schedule the removal of one row through the hook under test. */
const remove = (schedule: (input: DeferredRowRemovalInput) => void, id: string) =>
  act(() => {
    schedule({
      id,
      pendingMessage: `Removing ${id}…`,
      toastId: `remove-${id}`,
      commit: () => Promise.resolve(),
    });
  });

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
    // `cancel()` reports whether it really cancelled; a still-pending handle
    // answers `true`. A bare `vi.fn()` would answer `undefined` — i.e. "did not
    // cancel" — and quietly mute the paths that branch on it.
    notifyDeferredCommit.mockReturnValue({ cancel: vi.fn(() => true), flush: vi.fn() });
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
    const cancel = vi.fn(() => true);
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
    const cancel = vi.fn(() => true);
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

  it('restores BOTH rows when overlapping removals are undone in schedule order', () => {
    // The whole-cache snapshot could not do this. B's snapshot is taken while A
    // is already out, so replaying it re-applied a list with A missing — and A
    // then stayed missing until the list happened to refetch.
    const { client, view } = setup();
    remove(view.result.current, 'a');
    remove(view.result.current, 'b');
    expect(rowIds(client)).toEqual([]);

    act(() => capturedAt(0).onCancel()); // undo Ada
    act(() => capturedAt(1).onCancel()); // undo Bob

    expect(rowIds(client)).toEqual(['a', 'b']);
  });

  it('restores BOTH rows when overlapping removals are undone in reverse order', () => {
    // Per-row restores commute — the user undoes in whatever order they like,
    // so neither order may be the only one that works.
    const { client, view } = setup();
    remove(view.result.current, 'a');
    remove(view.result.current, 'b');

    act(() => capturedAt(1).onCancel()); // undo Bob
    act(() => capturedAt(0).onCancel()); // undo Ada

    expect(rowIds(client)).toEqual(['a', 'b']);
  });

  it('restores EVERY pending row when the owner unmounts mid-window', () => {
    // The cleanup cancels each pending handle in turn; with per-row restores
    // that loop cannot undo one row by re-applying a list that omits another.
    stubHandles();
    const { client, view } = setup();
    remove(view.result.current, 'a');
    remove(view.result.current, 'b');
    expect(rowIds(client)).toEqual([]);

    view.unmount();

    expect(rowIds(client)).toEqual(['a', 'b']);
    expect(notifyInfo).toHaveBeenCalledTimes(2);
  });

  it('does not claim "Undone" at unmount for a removal whose commit already started', () => {
    // `cancel()` is inert once the commit is under way and reports that with
    // `false`. The cleanup used to toast regardless — and since this toast
    // carries its own id it would sit BESIDE that write's confirmation, telling
    // the user a removal was undone while the very same removal was landing.
    //
    // An ordinary flush cannot reach this today: the hook's `settle()` runs
    // first inside `onCommit`, so it drops the row from the pending map before
    // unmount can see it (proven by the 'already settled' case above). This
    // drives the handle contract instead, so the toast stays honest whichever
    // way that ordering later moves.
    const handles = stubHandles();
    const { client, view } = setup();
    remove(view.result.current, 'a');
    remove(view.result.current, 'b');

    handles[0]?.beginCommit(); // Ada's write is in flight; Bob's is still pending

    view.unmount();

    expect(notifyInfo).toHaveBeenCalledTimes(1);
    expect(notifyInfo.mock.calls[0]?.[1]).toMatchObject({ id: 'deferred-cancelled-b' });
    // Ada's removal was NOT undone, so Ada must stay out of the list.
    expect(rowIds(client)).toEqual(['b']);
  });
});
