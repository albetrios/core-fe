import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { LOCALE_KEYS, LOCALE_NS } from '@/lib/i18n/locale.constants.ts';
import { closeControlClassName } from '@/lib/icon-surface.ts';
import { cn } from '@/lib/utils.ts';
import { X } from '@/shared/icons/index.ts';

export type SurfaceVariant = 'modal' | 'drawer';

export interface SurfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Presentation: a centered **modal** (default) or a right-side **drawer**.
   * Both collapse to a full-screen sheet on small screens.
   */
  as?: SurfaceVariant;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  showCloseButton?: boolean;
}

const OVERLAY =
  'fixed inset-0 z-50 bg-overlay/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

const BASE =
  'bg-background fixed z-50 flex flex-col gap-4 border outline-none transition data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

const MODAL =
  'top-[50%] start-[50%] max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] rtl:translate-x-[50%] translate-y-[-50%] rounded-lg p-6 sm:max-w-lg data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95';

// Full-screen sheet on mobile; inline-end panel from `sm` up.
const DRAWER =
  'inset-y-0 end-0 h-dvh w-full border-s p-6 sm:max-w-md data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right rtl:data-[state=open]:slide-in-from-left rtl:data-[state=closed]:slide-out-to-left';

/**
 * One adaptive container that renders its content as a centered **modal** or a
 * **right drawer** — switchable per use (`as`) and collapsing to a full-screen
 * sheet on small screens. Lets Settings / command / create-edit surfaces pick
 * their presentation without duplicating markup (D-27).
 */
export function Surface({
  open,
  onOpenChange,
  as = 'modal',
  title,
  description,
  children,
  footer,
  className,
  showCloseButton = true,
}: SurfaceProps) {
  const { t } = useTranslation(LOCALE_NS);
  const variantClass = as === 'drawer' ? DRAWER : MODAL;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={OVERLAY} />
        <DialogPrimitive.Content
          data-slot="surface"
          data-testid="surface"
          data-variant={as}
          className={cn(BASE, variantClass, className)}
        >
          <div className="flex flex-col gap-1.5 pe-6">
            <DialogPrimitive.Title className="text-lg leading-none font-semibold">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-muted-foreground text-sm">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">
                {title}
              </DialogPrimitive.Description>
            )}
          </div>

          <div className="-mx-1 flex-1 overflow-y-auto px-1">{children}</div>

          {footer ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}

          {showCloseButton ? (
            <DialogPrimitive.Close
              aria-label={t(LOCALE_KEYS.closeAria)}
              data-slot="button"
              className={cn(closeControlClassName, 'absolute end-4 top-4')}
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
