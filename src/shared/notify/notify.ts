import { createElement } from 'react';
import { toast } from 'sonner';

import { CustomToast, type ToastType } from './CustomToast.tsx';

/**
 * The single application toast surface — the ONLY module (besides the `<Toaster>`
 * mount in the route tree) that imports `sonner`. Every level renders the shared
 * {@link CustomToast} via `toast.custom`, so the toast look — including the TEMP
 * design variants — has one home and one consistent API.
 *
 * @example
 *   notify.success('Saved');
 *   notify.error(mapApiError(err));
 *   notify.loading('Saving…');
 *   notify.promise(save(), { loading: 'Saving…', success: 'Saved', error: 'Save failed' });
 */
export interface NotifyAction {
  label: string;
  onClick: () => void;
}

export interface NotifyOptions {
  /** Stable id to de-dupe / replace an existing toast. */
  id?: string | number;
  /** Secondary line under the message. */
  description?: string;
  /** Auto-dismiss after N ms (omit for the default). Use `Infinity` to persist. */
  duration?: number;
  /** Optional inline action (e.g. Undo). */
  action?: NotifyAction;
  /** Fires when the toast is dismissed (close button or auto-dismiss). */
  onDismiss?: () => void;
}

function show(type: ToastType, message: string, opts?: NotifyOptions) {
  // Never pass `id: undefined` — sonner #679 overwrites the generated id and breaks dismiss.
  const toastOpts = {
    ...(opts?.id !== undefined ? { id: opts.id } : {}),
    // `duration` is ALWAYS sent, `undefined` included — never made conditional.
    // A write to an id that is already on screen is a MERGE, not a replacement
    // (sonner `ToastState.create`: `{ ...toast, ...data }`), so a key this call
    // omits silently inherits the previous toast's value. Sending the key
    // resets it, because object spread copies keys whose value is `undefined`.
    // Without this, `notifyDeferredCommit` wrote its processing toast with
    // `notify.loading` (`duration: Infinity`) and then its success toast to the
    // same id with no duration — the success toast inherited `Infinity`, and
    // sonner's auto-close effect returns early on `duration === Infinity`, so
    // the confirmation sat on screen forever. `undefined` here is not a
    // hard-coded lifetime: sonner falls back to the `<Toaster>` duration and
    // then its own default, exactly as a first write to a fresh id does.
    duration: opts?.duration,
    unstyled: true as const,
    className: 'w-full',
    ...(opts?.onDismiss ? { onDismiss: () => opts.onDismiss?.() } : {}),
  };

  return toast.custom(
    (id) =>
      createElement(CustomToast, {
        id,
        type,
        title: message,
        description: opts?.description,
        action: opts?.action,
        onDismiss: opts?.onDismiss,
      }),
    toastOpts,
  );
}

export const notify = {
  success: (message: string, opts?: NotifyOptions) => show('success', message, opts),
  error: (message: string, opts?: NotifyOptions) => show('error', message, opts),
  info: (message: string, opts?: NotifyOptions) => show('info', message, opts),
  warning: (message: string, opts?: NotifyOptions) => show('warning', message, opts),
  /** Spinner toast for in-flight work — dismiss explicitly when done. */
  loading: (message: string, opts?: NotifyOptions) =>
    show('loading', message, { duration: Infinity, ...opts }),
  /** Drive a toast from a promise's lifecycle (loading → success / error). */
  promise: <T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string },
  ) => toast.promise(promise, messages),
  /** Dismiss a toast by id, or all toasts when no id is given. */
  dismiss: (id?: string | number) => toast.dismiss(id),
};
