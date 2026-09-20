import { createElement } from 'react';
import { toast, Toaster as renderer } from 'sonner';

import { CustomToast, type ToastType } from './CustomToast.tsx';
import type { NotifyOptions } from './notify.ts';

export { renderer };

/** Publish through Sonner only after its host has subscribed. */
export function show(type: ToastType, message: string, opts: NotifyOptions) {
  return toast.custom(
    (id) =>
      createElement(CustomToast, {
        id,
        type,
        title: message,
        description: opts.description,
        action: opts.action,
        onDismiss: opts.onDismiss,
      }),
    {
      id: opts.id,
      // Reset a previous loading toast's Infinity when replacing its content.
      duration: opts.duration,
      unstyled: true,
      className: 'w-full',
      ...(opts.onDismiss ? { onDismiss: () => opts.onDismiss?.() } : {}),
    },
  );
}

/** Keep Sonner's promise result handling and unwrap behavior. */
export function promise<T>(
  value: Promise<T>,
  messages: { loading: string; success: string; error: string },
  id: string | number,
) {
  return toast.promise(value, { ...messages, id });
}

/** Dismiss without importing the renderer when there is nothing to render. */
export const dismiss = toast.dismiss;
