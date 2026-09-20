import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { ERRORS_KEYS, ERRORS_NS } from '@/lib/i18n/errors.constants.ts';
import { X } from '@/shared/icons/index.ts';
import { useThemeStore } from '@/shared/store/useThemeStore/index.ts';
import type { ToastPosition } from '@/shared/theme/index.ts';

import { notificationBridge, notify } from './notify.ts';

/** Immediate notification content, upgraded to Sonner once its host is ready. */
export function AppToaster() {
  const { t } = useTranslation(ERRORS_NS);
  const position = useThemeStore((s) => s.toastPosition) as ToastPosition;
  const state = useSyncExternalStore(
    notificationBridge.subscribe,
    notificationBridge.getSnapshot,
    notificationBridge.getSnapshot,
  );
  const Renderer = state.runtime?.renderer;
  useEffect(() => {
    if (Renderer) return notificationBridge.activate();
  }, [Renderer]);
  const vertical = position.startsWith('top') ? 'top-16 sm:top-[4.5rem]' : 'bottom-4';
  const edge = position.endsWith('left') ? 'start-4' : 'end-4';
  const horizontal = position.endsWith('center')
    ? 'start-1/2 -translate-x-1/2 rtl:translate-x-1/2'
    : edge;

  return createPortal(
    <>
      {Renderer ? (
        <Renderer
          position={position}
          gap={10}
          visibleToasts={4}
          offset={position.startsWith('top') ? { top: '4.5rem' } : undefined}
          mobileOffset={position.startsWith('top') ? { top: '4rem' } : undefined}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast:
                'pointer-events-auto w-full max-w-[min(100vw-2rem,20rem)] touch-auto',
            },
          }}
        />
      ) : null}
      {state.pending.length > 0 ? (
        <section
          data-sonner-toaster
          className={`pointer-events-none fixed z-[999999999] flex w-[min(100vw-2rem,20rem)] flex-col gap-2.5 ${vertical} ${horizontal}`}
        >
          {state.pending.slice(-4).map(({ id, type, message, options }) => (
            <article
              key={id}
              data-testid="app-toast"
              data-toast-pending
              data-slot="card"
              className="bg-popover text-popover-foreground border-border pointer-events-auto flex items-start gap-2.5 border px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <output role={type === 'error' ? 'alert' : undefined} className="block">
                  <span className="block text-sm font-medium">{message}</span>
                  {options.description ? (
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {options.description}
                    </span>
                  ) : null}
                </output>
                {options.action ? (
                  <button
                    type="button"
                    data-testid="toast-action"
                    className="mt-1 text-xs underline"
                    onClick={() => {
                      options.action?.onClick();
                      notify.dismiss(id);
                    }}
                  >
                    {options.action.label}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                data-testid="toast-dismiss"
                className="flex size-6 shrink-0 items-center justify-center rounded-sm"
                aria-label={t(ERRORS_KEYS.toast.dismiss)}
                onClick={() => {
                  options.onDismiss?.();
                  notify.dismiss(id);
                }}
              >
                <X className="size-3.5" />
              </button>
            </article>
          ))}
        </section>
      ) : null}
    </>,
    document.body,
  );
}
