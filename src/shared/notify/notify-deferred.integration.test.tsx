import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';

import { AppToaster } from './AppToaster.tsx';
import { notify } from './notify.ts';
import { type DeferredCommit, notifyDeferredCommit } from './notify-deferred.ts';

/**
 * The undo path against REAL sonner and a real DOM.
 *
 * The unit suite beside this one mocks `notify`, so it can see which id each
 * toast is written to but never whether the toast survives being written. The
 * bug lived exactly there: `CustomToast` dismisses the toast that owns the
 * inline action the instant the action returns, so an "Undone" toast written
 * back to that same id was torn down one frame after it appeared.
 */

const undoneCopy = () => i18n.t(ERRORS_KEYS.toast.undone, { ns: ERRORS_NS });
/** Comfortably past sonner's 200ms unmount, comfortably inside its 4s lifetime. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 700));
/** The sonner row a piece of toast copy is rendered in. */
const toastRowFor = (text: string) =>
  screen.getByText(text).closest('[data-sonner-toast]');

describe('notifyDeferredCommit (real toast surface)', () => {
  /** Handles whose commit window must not outlive their test. */
  const scheduled: DeferredCommit[] = [];

  afterEach(() => {
    for (const handle of scheduled) handle.cancel();
    scheduled.length = 0;
    act(() => {
      notify.dismiss();
    });
  });

  function schedule(onCommit = vi.fn()) {
    let handle!: DeferredCommit;
    act(() => {
      handle = notifyDeferredCommit({
        pendingMessage: 'Removing Jo Rivera…',
        onCommit,
        // Long enough that the commit never fires inside a test — every case
        // here is about the undo window, not about what happens after it.
        delayMs: 60_000,
        toastId: 'remove-member-mem_1',
      });
    });
    scheduled.push(handle);
    return handle;
  }

  const clickUndo = async (user: ReturnType<typeof userEvent.setup>) => {
    await waitFor(() => expect(screen.getByTestId('toast-action')).toBeVisible(), {
      timeout: 5000,
    });
    await user.click(screen.getByTestId('toast-action'));
  };

  it('keeps the "Undone" toast on screen after Undo is clicked', async () => {
    // Regression: the confirmation reused the pending toast's id, and
    // `ToastInlineAction` runs `action.onClick(); toast.dismiss(id)` — so the
    // statement right after the one that wrote this toast dismissed it. The
    // user saw it blink out and was left with no sign that undo had worked.
    const user = userEvent.setup();
    render(<AppToaster />);
    schedule();
    await clickUndo(user);

    // Sonner flags a dismissed row `data-removed` well before it unmounts it,
    // so this waits for the click's dismiss to have actually LANDED — no
    // sleeping, and no window in which a doomed toast still looks healthy.
    await waitFor(() =>
      expect(
        document.querySelector('[data-sonner-toast][data-removed="true"]'),
      ).not.toBeNull(),
    );

    // The row carrying the confirmation must not be the row being removed.
    expect(toastRowFor(undoneCopy())).toHaveAttribute('data-removed', 'false');
    // …and it is still there once that removal has run its course.
    await act(settle);
    expect(screen.getByText(undoneCopy())).toBeInTheDocument();
  });

  it('replaces the pending toast rather than stacking beside it', async () => {
    // The distinct id must not cost the "one toast, start to finish" property:
    // the same click dismisses the pending toast, so the user is left with the
    // confirmation alone rather than a pair.
    const user = userEvent.setup();
    render(<AppToaster />);
    schedule();
    await clickUndo(user);

    await waitFor(
      () => expect(screen.queryByText('Removing Jo Rivera…')).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.getAllByTestId('app-toast')).toHaveLength(1);
    expect(screen.getByText(undoneCopy())).toBeInTheDocument();
  });

  it('cancels the scheduled commit when Undo is clicked', async () => {
    // The confirmation surviving is only worth anything if it tells the truth.
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<AppToaster />);
    const handle = schedule(onCommit);
    await clickUndo(user);

    expect(onCommit).not.toHaveBeenCalled();
    // Already cancelled — a second cancel reports that it did nothing.
    expect(handle.cancel()).toBe(false);
  });
});
