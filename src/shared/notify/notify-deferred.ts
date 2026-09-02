import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import i18n from '@/lib/i18n/i18n.ts';

import { notify } from './notify.ts';

const DEFAULT_DELAY_MS = 5000;

/** Handle for a scheduled commit — the caller owns its lifetime. */
export interface DeferredCommit {
  /**
   * Abandon the pending commit and run `onCancel`. No-op once it has started.
   *
   * @returns `true` only when this call actually cancelled; `false` when the
   *   commit had already started (or was already cancelled). Anything that
   *   tells the user "undone" MUST branch on this — the undo affordance
   *   outlives the commit window, so a click can land on a write in flight.
   */
  cancel: () => boolean;
  /** Run the commit NOW instead of waiting out the window. No-op once settled. */
  flush: () => void;
}

/**
 * Show an undoable toast, then run `onCommit` after a short delay unless the
 * user cancels.
 *
 * **One toast, start to finish.** The pending toast, the processing toast and
 * the final confirmation all reuse `toastId`, so sonner REPLACES each with the
 * next instead of stacking them. The mutation behind `onCommit` must therefore
 * not raise a success toast of its own — pass its "suppress" flag and hand the
 * copy here as `committedMessage`; otherwise the user gets two success toasts
 * five seconds apart for one action. The one exception is the undo
 * confirmation, which takes `${toastId}-undone` — see `undoneToastId` below for
 * why reusing the id makes that toast invisible rather than tidy.
 *
 * **Cancelling means undoing.** `onCancel` fires when the user hits Undo or
 * dismisses the toast — that is where a caller that already removed a row
 * optimistically puts it back. It never fires once the commit has started, so a
 * caller can trust it as the single "this did not happen" signal.
 *
 * **The caller owns the timer.** The returned handle exists so a component can
 * `flush()` on unmount rather than leave a `setTimeout` running against a torn
 * down owner (SET-7: closing Settings mid-window committed the delete five
 * seconds later, from nowhere, with the undo affordance already gone).
 */
export function notifyDeferredCommit({
  pendingMessage,
  processingMessage,
  committedMessage,
  onCommit,
  onCancel,
  onCommitError,
  delayMs = DEFAULT_DELAY_MS,
  toastId = 'deferred-commit',
}: {
  pendingMessage: string;
  /** Shown while `onCommit` runs; defaults to the pending message. */
  processingMessage?: string;
  /** Shown when `onCommit` resolves. Omit for no closing toast. */
  committedMessage?: string;
  onCommit: () => void | Promise<void>;
  /** Undo / dismiss — roll back anything applied at schedule time. */
  onCancel?: () => void;
  /** The commit itself failed — roll back anything applied at schedule time. */
  onCommitError?: (error: unknown) => void;
  delayMs?: number;
  toastId?: string | number;
}): DeferredCommit {
  let state: 'pending' | 'committing' | 'cancelled' = 'pending';

  const flush = () => {
    if (state !== 'pending') return;
    state = 'committing';
    clearTimeout(timer);
    notify.loading(processingMessage ?? pendingMessage, { id: toastId });
    Promise.resolve(onCommit())
      .then(() => {
        if (committedMessage) notify.success(committedMessage, { id: toastId });
        else notify.dismiss(toastId);
      })
      .catch((error: unknown) => {
        // The mutation raises its own error toast; this only has to undo the
        // optimistic change and get the pending toast off the screen.
        notify.dismiss(toastId);
        onCommitError?.(error);
      });
  };

  const cancel = () => {
    // Sonner fires `onDismiss` when the pending toast is REPLACED at commit
    // time too, so this must be inert once the commit is under way — otherwise
    // every successful commit would immediately "undo" itself.
    if (state !== 'pending') return false;
    state = 'cancelled';
    clearTimeout(timer);
    onCancel?.();
    return true;
  };

  const timer = setTimeout(flush, delayMs);

  /**
   * The undo confirmation gets its OWN id, and must keep it.
   *
   * The shared toast surface dismisses the toast that owns the inline action
   * the instant the action returns (`CustomToast` → `ToastInlineAction`:
   * `action.onClick(); toast.dismiss(id)`). Anything written back to `toastId`
   * from inside `onClick` is therefore torn down one frame after it appears —
   * the user saw "Action cancelled" blink out. Written to a separate id, the
   * pending toast still goes away on that dismiss and this one survives it.
   *
   * Nothing else in this file has the same hazard: every other write
   * (`loading` / `success` / `dismiss` in `flush`) is driven by the timer or by
   * the caller's `flush()`, never from inside a toast action, so no dismiss of
   * `toastId` follows it. Keep it that way — a same-id write reached from
   * `onClick` is silently invisible.
   */
  const undoneToastId = `${toastId}-undone`;

  notify.success(pendingMessage, {
    id: toastId,
    duration: delayMs + 800,
    onDismiss: cancel,
    action: {
      label: i18n.t(ERRORS_KEYS.toast.undo, { ns: ERRORS_NS }),
      onClick: () => {
        // This toast deliberately outlives the commit window (`duration` above,
        // longer still while hovered), so Undo stays clickable after `flush`
        // has fired. Toasting unconditionally told the user their deletion was
        // rolled back while the DELETE was in flight — then the commit's own
        // success toast contradicted it a moment later.
        //
        // Losing the race is silent on purpose: from `flush` onward the commit
        // owns `toastId` and is already reporting the truth (processing →
        // committed / dismissed). A second toast here could only overwrite that
        // real outcome with a false one.
        if (!cancel()) return;
        notify.info(i18n.t(ERRORS_KEYS.toast.undone, { ns: ERRORS_NS }), {
          id: undoneToastId,
        });
      },
    },
  });

  return { cancel, flush };
}
