import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { notifySuccess, notifyDismiss, notifyInfo, notifyLoading } = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyDismiss: vi.fn(),
  notifyInfo: vi.fn(),
  notifyLoading: vi.fn(),
}));

vi.mock('./notify.ts', () => ({
  notify: {
    success: notifySuccess,
    dismiss: notifyDismiss,
    info: notifyInfo,
    loading: notifyLoading,
  },
}));

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';

import { notifyDeferredCommit } from './notify-deferred.ts';

const undoneCopy = () => i18n.t(ERRORS_KEYS.toast.undone, { ns: ERRORS_NS });
const clickUndo = () => notifySuccess.mock.calls[0]?.[1]?.action?.onClick();

describe('notifyDeferredCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs onCommit after the delay, reusing one toast id throughout', async () => {
    // SET-7: pending → processing → committed all share `toastId`, so sonner
    // REPLACES each with the next. Two ids meant two toasts for one action.
    const onCommit = vi.fn().mockResolvedValue(undefined);
    notifyDeferredCommit({
      pendingMessage: 'Removing…',
      processingMessage: 'Processing…',
      committedMessage: 'Member removed',
      onCommit,
      delayMs: 100,
      toastId: 'remove-1',
    });
    expect(notifySuccess).toHaveBeenCalledWith(
      'Removing…',
      expect.objectContaining({ id: 'remove-1' }),
    );
    expect(onCommit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(notifyLoading).toHaveBeenCalledWith('Processing…', { id: 'remove-1' });
    expect(onCommit).toHaveBeenCalled();

    await vi.waitFor(() =>
      expect(notifySuccess).toHaveBeenCalledWith('Member removed', { id: 'remove-1' }),
    );
    // Every toast this raised carries the SAME id — never a second one.
    const ids = [...notifySuccess.mock.calls, ...notifyLoading.mock.calls].map(
      (call) => (call[1] as { id?: string } | undefined)?.id,
    );
    expect(new Set(ids)).toEqual(new Set(['remove-1']));
  });

  it('dismisses the toast when there is no closing message', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    notifyDeferredCommit({
      pendingMessage: 'Removing…',
      onCommit,
      delayMs: 10,
      toastId: 'r',
    });
    vi.advanceTimersByTime(10);
    await vi.waitFor(() => expect(notifyDismiss).toHaveBeenCalledWith('r'));
  });

  it('cancels onCommit and calls onCancel when undo is clicked', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    notifyDeferredCommit({
      pendingMessage: 'Removing…',
      onCommit,
      onCancel,
      delayMs: 100,
      toastId: 'r',
    });
    const action = notifySuccess.mock.calls[0]?.[1]?.action;
    action?.onClick();
    vi.advanceTimersByTime(200);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(notifyInfo).toHaveBeenCalled();
  });

  it('cancels onCommit when the pending toast is dismissed', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    notifyDeferredCommit({
      pendingMessage: 'Removing…',
      onCommit,
      onCancel,
      delayMs: 100,
      toastId: 'r',
    });
    notifySuccess.mock.calls[0]?.[1]?.onDismiss?.();
    vi.advanceTimersByTime(200);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(notifyLoading).not.toHaveBeenCalled();
  });

  it('ignores a dismiss that arrives once the commit has started', () => {
    // The pending toast is REPLACED at commit time, and sonner reports that as
    // a dismiss. Treating it as an undo would roll back every successful commit.
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    notifyDeferredCommit({
      pendingMessage: 'Removing…',
      onCommit,
      onCancel,
      delayMs: 10,
      toastId: 'r',
    });
    vi.advanceTimersByTime(10);
    notifySuccess.mock.calls[0]?.[1]?.onDismiss?.();

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('claims "Undone" for an undo that lands inside the window', () => {
    // The winning side of the race below: cancel() really cancelled, so the
    // user is owed the confirmation.
    const onCommit = vi.fn();
    notifyDeferredCommit({
      pendingMessage: 'Removing…',
      onCommit,
      delayMs: 100,
      toastId: 'r',
    });

    clickUndo();

    expect(notifyInfo).toHaveBeenCalledWith(undoneCopy(), { id: 'r' });
    vi.advanceTimersByTime(200);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not claim "Undone" for an undo that lands after the commit started', async () => {
    // The pending toast outlives the commit window, so Undo is still clickable
    // once flush() has fired — and cancel() is inert by then. Toasting anyway
    // told the user the removal was rolled back while the DELETE was in flight.
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    notifyDeferredCommit({
      pendingMessage: 'Removing…',
      committedMessage: 'Member removed',
      onCommit,
      onCancel,
      delayMs: 10,
      toastId: 'r',
    });

    vi.advanceTimersByTime(10);
    expect(onCommit).toHaveBeenCalledTimes(1);

    clickUndo();

    expect(onCancel).not.toHaveBeenCalled();
    expect(notifyInfo).not.toHaveBeenCalled();
    // Silence is only correct because the commit still reports the truth on the
    // same toast id — the user is never left without an outcome.
    await vi.waitFor(() =>
      expect(notifySuccess).toHaveBeenCalledWith('Member removed', { id: 'r' }),
    );
  });

  it('flush() commits immediately and is inert afterwards', () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const handle = notifyDeferredCommit({
      pendingMessage: 'Removing…',
      onCommit,
      delayMs: 5000,
      toastId: 'r',
    });

    handle.flush();
    expect(onCommit).toHaveBeenCalledTimes(1);

    // The window is over — neither a second flush nor the timer may re-run it.
    handle.flush();
    handle.cancel();
    vi.advanceTimersByTime(10_000);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('rolls back through onCommitError when the write fails', async () => {
    const onCommitError = vi.fn();
    notifyDeferredCommit({
      pendingMessage: 'Removing…',
      onCommit: () => Promise.reject(new Error('nope')),
      onCommitError,
      delayMs: 10,
      toastId: 'r',
    });
    vi.advanceTimersByTime(10);
    await vi.waitFor(() => expect(onCommitError).toHaveBeenCalledTimes(1));
    expect(notifyDismiss).toHaveBeenCalledWith('r');
  });
});
